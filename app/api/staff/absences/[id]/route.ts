import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendPushToDiscordIds } from "@/lib/push";
import { requirePrivileged, requireFullWriter } from "@/lib/guards";
import { getSession } from "@/auth";
import { logInfo, logWarn, logError, makeRequestId } from "@/lib/obs";
import { AbsenceStatus } from "@prisma/client";
import { enqueueDeleteMessage, enqueueEmbedMessage, getOrCreateDiscordConfig, enqueueMemberDm } from "@/lib/discord/discord";

const STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
const ABSENCE_TYPES = ["MEETING", "GENERAL"] as const;

type AbsenceType = (typeof ABSENCE_TYPES)[number];
type AbsenceUiStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELED" | "EXPIRED";
type AbsenceMeta = {
  v: 1;
  type: AbsenceType;
  meetingDate: string | null;
  memberNotes: string | null;
  rejectionReason: string | null;
  rejectedById: string | null;
  rejectedAt: string | null;
};

function isValidStatus(value: string) {
  return STATUSES.includes(value as (typeof STATUSES)[number]);
}

function canChangeStatus(current: string, next: string) {
  if (current === next) return true;
  if (current === "PENDING") return ["APPROVED", "REJECTED"].includes(next);
  return false;
}

function parseAbsenceType(value: unknown): AbsenceType {
  const normalized = String(value ?? "GENERAL").trim().toUpperCase();
  return normalized === "MEETING" ? "MEETING" : "GENERAL";
}

function parseAbsenceMeta(notes: string | null | undefined): AbsenceMeta {
  if (!notes) {
    return {
      v: 1,
      type: "GENERAL",
      meetingDate: null,
      memberNotes: null,
      rejectionReason: null,
      rejectedById: null,
      rejectedAt: null,
    };
  }

  try {
    const parsed = JSON.parse(notes) as Partial<AbsenceMeta>;
    const type = parseAbsenceType(parsed.type);
    return {
      v: 1,
      type,
      meetingDate: typeof parsed.meetingDate === "string" ? parsed.meetingDate : null,
      memberNotes: typeof parsed.memberNotes === "string" ? parsed.memberNotes : null,
      rejectionReason: typeof parsed.rejectionReason === "string" ? parsed.rejectionReason : null,
      rejectedById: typeof parsed.rejectedById === "string" ? parsed.rejectedById : null,
      rejectedAt: typeof parsed.rejectedAt === "string" ? parsed.rejectedAt : null,
    };
  } catch {
    return {
      v: 1,
      type: "GENERAL",
      meetingDate: null,
      memberNotes: notes,
      rejectionReason: null,
      rejectedById: null,
      rejectedAt: null,
    };
  }
}

function stringifyAbsenceMeta(meta: AbsenceMeta): string {
  return JSON.stringify(meta);
}

function computeUiStatus(status: string, endAt: Date): AbsenceUiStatus {
  if (status === "APPROVED" && endAt.getTime() < Date.now()) {
    return "EXPIRED";
  }
  return status as AbsenceUiStatus;
}

function toResponseAbsence(item: any) {
  const meta = parseAbsenceMeta(item.notes);
  return {
    id: item.id,
    familyId: item.familyId,
    memberId: item.memberId,
    member: item.member,
    discordId: item.discordId,
    reason: item.reason,
    notes: meta.memberNotes,
    type: meta.type,
    meetingDate: meta.meetingDate,
    status: item.status,
    uiStatus: computeUiStatus(item.status, item.endAt),
    rejectionReason: meta.rejectionReason,
    startAt: item.startAt.toISOString(),
    endAt: item.endAt.toISOString(),
    decidedAt: item.decidedAt ? item.decidedAt.toISOString() : null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = req.headers.get("x-request-id") || makeRequestId();
  const { id } = await params;
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  try {
    const item = await prisma.absence.findUnique({
      where: { id },
      include: {
        member: { select: { id: true, rpName: true, discordId: true, steamId: true } },
      },
    });
    if (!item) {
      logWarn("absence_get_not_found", { requestId, id });
      return NextResponse.json({ ok: false, error: "NOT_FOUND", requestId }, { status: 404 });
    }

    return NextResponse.json({ ok: true, requestId, data: toResponseAbsence(item) });
  } catch (error) {
    logError("absence_get_error", { requestId, id }, error);
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR", requestId }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = req.headers.get("x-request-id") || makeRequestId();
  const { id } = await params;
  const guard = await requireFullWriter();
  if (guard instanceof Response) return guard;

  const session = await getSession();
  const actorId = session?.user?.id;
  if (!actorId) {
    logWarn("absence_delete_unauthenticated", { requestId, id });
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED", requestId }, { status: 401 });
  }

  try {
    const existing = await prisma.absence.findUnique({ where: { id } });
    if (!existing) {
      logWarn("absence_delete_not_found", { requestId, id });
      return NextResponse.json({ ok: false, error: "NOT_FOUND", requestId }, { status: 404 });
    }

    // Si un message Discord existe, on l'enqueue pour suppression AVANT de
    // delete la row (sinon on perd le messageId). Idempotent côté worker.
    if (existing.discordMessageId) {
      try {
        const config = await getOrCreateDiscordConfig("esperados");
        if (config.absencesChannelId) {
          await enqueueDeleteMessage({
            familyId: existing.familyId,
            channelId: config.absencesChannelId,
            messageId: existing.discordMessageId,
            entity: "Absence",
            entityId: existing.id,
          });
        }
      } catch (err) {
        logWarn("absence_delete_discord_delete_failed", { requestId, id, error: String(err) });
      }
    }

    await prisma.absence.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        familyId: existing.familyId,
        actorId,
        action: "delete",
        entity: "Absence",
        entityId: id,
        meta: { memberId: existing.memberId, discordId: existing.discordId, status: existing.status },
      },
    });

    logInfo("absence_deleted", { requestId, id, actorId });
    return NextResponse.json({ ok: true, requestId });
  } catch (error) {
    logError("absence_delete_error", { requestId, id }, error);
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR", requestId }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = req.headers.get("x-request-id") || makeRequestId();
  const { id } = await params;
  const guard = await requireFullWriter();
  if (guard instanceof Response) return guard;

  const session = await getSession();
  const actorId = session?.user?.id;
  if (!actorId) {
    logWarn("absence_decide_unauthenticated", { requestId, id });
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED", requestId }, { status: 401 });
  }

  try {
    const existing = await prisma.absence.findUnique({ where: { id } });
    if (!existing) {
      logWarn("absence_decide_not_found", { requestId, id });
      return NextResponse.json({ ok: false, error: "NOT_FOUND", requestId }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      logWarn("absence_decide_invalid_body", { requestId, id });
      return NextResponse.json({ ok: false, error: "INVALID_BODY", requestId }, { status: 400 });
    }

    if (!("status" in body)) {
      logWarn("absence_decide_missing_status", { requestId, id });
      return NextResponse.json({ ok: false, error: "MISSING_STATUS", requestId }, { status: 400 });
    }

    const value = String(body.status ?? "").trim();
    if (!isValidStatus(value)) {
      logWarn("absence_decide_invalid_status", { requestId, id, status: value });
      return NextResponse.json({ ok: false, error: "INVALID_STATUS", requestId }, { status: 400 });
    }
    if (!canChangeStatus(existing.status, value)) {
      logWarn("absence_decide_invalid_transition", { requestId, id, from: existing.status, to: value });
      return NextResponse.json({ ok: false, error: "INVALID_STATUS_TRANSITION", requestId }, { status: 400 });
    }

    const rejectionReasonRaw = String(body.rejectionReason ?? "").trim();
    if (value === "REJECTED" && !rejectionReasonRaw) {
      return NextResponse.json({ ok: false, error: "MISSING_REJECTION_REASON", requestId }, { status: 400 });
    }

    const existingMeta = parseAbsenceMeta(existing.notes);
    const decidedAt = new Date();
    const nextMeta: AbsenceMeta = {
      ...existingMeta,
      rejectionReason: value === "REJECTED" ? rejectionReasonRaw : null,
      rejectedById: value === "REJECTED" ? actorId : null,
      rejectedAt: value === "REJECTED" ? decidedAt.toISOString() : null,
    };

    const updated = await prisma.absence.update({
      where: { id },
      data: {
        status: value as AbsenceStatus,
        notes: stringifyAbsenceMeta(nextMeta),
        decidedById: actorId,
        decidedAt,
      },
    });

    await prisma.auditLog.create({
      data: {
        familyId: updated.familyId,
        actorId,
        action: "decide",
        entity: "Absence",
        entityId: updated.id,
        meta: { oldStatus: existing.status, newStatus: updated.status },
      },
    });

    // ── Notification Discord : APPROVED / REJECTED ──────────────────────
    // On envoie un embed dans le channel #absences mentionnant le membre
    // (donc il reçoit une notif Discord native). Le decider est nommé pour
    // la traçabilité. La couleur change selon la décision.
    // Non-bloquant : si Discord est down ou le channel non configuré, on log.
    try {
      const config = await getOrCreateDiscordConfig("esperados");
      if (config.absencesChannelId) {
        // Récupère le nom du staff qui a tranché (depuis User.name + Member.rpName si lié)
        let deciderLabel = session?.user?.name ?? "Staff";
        try {
          const decider = await prisma.user.findUnique({
            where: { id: actorId },
            select: {
              name: true,
              accounts: {
                where: { provider: "discord" },
                select: { providerAccountId: true },
                take: 1,
              },
            },
          });
          const deciderDiscordId = decider?.accounts?.[0]?.providerAccountId ?? null;
          if (deciderDiscordId) {
            const deciderMember = await prisma.member.findFirst({
              where: { discordId: deciderDiscordId },
              select: { rpName: true },
            });
            deciderLabel = deciderMember?.rpName ?? decider?.name ?? deciderLabel;
          }
        } catch {
          /* fallback à user.name déjà posé */
        }

        const memberMention = updated.discordId ? `<@${updated.discordId}>` : "_Membre_";
        const startTs = Math.floor(updated.startAt.getTime() / 1000);
        const endTs = Math.floor(updated.endAt.getTime() / 1000);
        const typeLabel = existingMeta?.type === "MEETING" ? "Réunion" : "Générale";

        const fields: Array<{ name: string; value: string; inline?: boolean }> = [
          { name: "📅  Début", value: `<t:${startTs}:f>`, inline: true },
          { name: "📅  Fin", value: `<t:${endTs}:f>`, inline: true },
          { name: "🏷️  Type", value: typeLabel, inline: true },
        ];
        if (updated.reason && updated.reason.trim()) {
          fields.push({ name: "📋  Motif", value: updated.reason.trim().slice(0, 1024), inline: false });
        }
        if (value === "REJECTED" && rejectionReasonRaw) {
          fields.push({ name: "❌  Raison du refus", value: rejectionReasonRaw.slice(0, 1024), inline: false });
        }
        fields.push({ name: "👮  Décision par", value: deciderLabel, inline: false });

        const isApproved = value === "APPROVED";
        const embed = {
          title: isApproved ? "✅  Absence approuvée" : "❌  Absence refusée",
          description: memberMention,
          color: isApproved ? 0x10b981 /* emerald */ : 0xdc2626 /* red */,
          fields,
          timestamp: new Date().toISOString(),
          footer: { text: "Los Esperados  •  Décision absence" },
        };

        await enqueueEmbedMessage({
          familyId: existing.familyId,
          channelId: config.absencesChannelId,
          embeds: [embed],
          entity: "Absence",
          entityId: existing.id,
        });
        logInfo("absence_decide_discord_notify_enqueued", { requestId, id, status: updated.status });
      } else {
        logWarn("absence_decide_no_absences_channel", { requestId, id });
      }
    } catch (notifyErr) {
      logWarn("absence_decide_discord_notify_failed", {
        requestId,
        id,
        error: notifyErr instanceof Error ? notifyErr.message : String(notifyErr),
      });
    }

    // Si REJECTED : on supprime le message Discord d'absence (plus valide).
    // APPROVED garde le message visible jusqu'à expire-discord (endAt passé).
    if (value === "REJECTED" && existing.discordMessageId) {
      try {
        const config = await getOrCreateDiscordConfig("esperados");
        if (config.absencesChannelId) {
          await enqueueDeleteMessage({
            familyId: existing.familyId,
            channelId: config.absencesChannelId,
            messageId: existing.discordMessageId,
            entity: "Absence",
            entityId: existing.id,
          });
          await prisma.absence.update({
            where: { id: existing.id },
            data: { discordMessageId: null },
          });
        }
      } catch (err) {
        logWarn("absence_rejected_discord_delete_failed", { requestId, id, error: String(err) });
      }
    }

    logInfo("absence_decided", { requestId, id, status: updated.status });
    // Notification push au membre (fire-and-forget).
    if (existing.discordId) {
      const approved = value === "APPROVED";
      const dmTitle = approved ? "✅ Absence approuvée" : "❌ Absence refusée";
      const dmBody = approved
        ? "Ta demande d'absence a été acceptée."
        : `Ta demande d'absence a été refusée${rejectionReasonRaw ? " — " + rejectionReasonRaw : "."}`;
      void sendPushToDiscordIds([existing.discordId], {
        title: dmTitle,
        body: dmBody,
        url: "/dashboard",
        tag: "absence-" + updated.id,
      }).catch(() => {});
      void enqueueMemberDm({
        familyId: existing.familyId,
        discordId: existing.discordId,
        title: dmTitle,
        body: dmBody,
        url: "/dashboard",
        dedupeKey: "member_dm:absence:" + updated.id + ":" + value,
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true, requestId, data: toResponseAbsence(updated) });
  } catch (error) {
    logError("absence_decide_error", { requestId, id }, error);
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR", requestId }, { status: 500 });
  }
}
