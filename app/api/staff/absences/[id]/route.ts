import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePrivileged } from "@/lib/guards";
import { getSession } from "@/auth";
import { enqueueMessageFromTemplate, getOrCreateDiscordConfig } from "@/lib/discord/discord";
import { logInfo, logWarn, logError, makeRequestId } from "@/lib/obs";
import { AbsenceStatus } from "@prisma/client";

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
  const guard = await requirePrivileged();
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
  const guard = await requirePrivileged();
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

    if (updated.status === "APPROVED") {
      try {
        const config = await getOrCreateDiscordConfig(updated.familyId);
        await enqueueMessageFromTemplate({
          familyId: updated.familyId,
          channelId: config.absencesChannelId,
          key: "absence.approved",
          vars: {
            discordId: updated.discordId,
            startAt: updated.startAt.toISOString(),
            endAt: updated.endAt.toISOString(),
            status: updated.status,
          },
          entity: "Absence",
          entityId: updated.id,
        });
      } catch (err) {
        logWarn("absence_decide_discord_enqueue_failed", { requestId, id });
      }
    }

    logInfo("absence_decided", { requestId, id, status: updated.status });
    return NextResponse.json({ ok: true, requestId, data: toResponseAbsence(updated) });
  } catch (error) {
    logError("absence_decide_error", { requestId, id }, error);
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR", requestId }, { status: 500 });
  }
}
