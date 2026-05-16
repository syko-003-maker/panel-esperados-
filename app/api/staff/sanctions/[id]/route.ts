import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { getEntityAuditLogs, auditStaffAction } from "@/lib/audit";
import { enqueueRemoveRole } from "@/lib/discord/discord";
import { getAvertRoleId, SANCTION_DELETE_BLOCKING_OUTBOX_STATUSES } from "@/lib/sanctions";

const TYPES = [
  "AVERT_ORAL_PLAYTIME",
  "AVERT_ORAL_REUNION",
  "AVERT_LEGER",
  "AVERT_LOURD",
  "AVERT_EM",
  "DEMOTE",
  "RESERVISTE",
  "BLACKLIST",
] as const;

function isValidType(value: string) {
  return TYPES.includes(value as (typeof TYPES)[number]);
}

function mapStatusToApi(status: string) {
  return status;
}

function parseDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

async function expireIfNeeded(sanctionId: string, expiresAt: Date | null, status: string) {
  if (status !== "ACTIVE" || !expiresAt || expiresAt.getTime() >= Date.now()) return status;

  const sanction = await prisma.sanction.findUnique({
    where: { id: sanctionId },
    select: {
      id: true,
      familyId: true,
      discordId: true,
      type: true,
    },
  });

  const roleId = getAvertRoleId(sanction?.type ?? "");
  const guildId = process.env.DISCORD_GUILD_ID ?? process.env.GUILD_ID ?? "";
  const shouldQueueCleanup = Boolean(sanction?.discordId && roleId && guildId);

  const updated = await prisma.sanction.update({
    where: { id: sanctionId },
    data: {
      status: "EXPIRED",
      closedAt: new Date(),
      clearedStatus: shouldQueueCleanup ? "PENDING" : undefined,
      clearedError: shouldQueueCleanup ? null : undefined,
    } as any,
  });

  if (sanction && shouldQueueCleanup) {
    await enqueueRemoveRole({
      familyId: sanction.familyId,
      guildId,
      userDiscordId: sanction.discordId!,
      roleId: roleId!,
      entity: "Sanction",
      entityId: sanction.id,
      meta: {
        sanctionId: sanction.id,
        sanctionType: sanction.type,
        setClearedAt: false,
      },
    });
  }

  return updated.status;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const item = (await prisma.sanction.findUnique({
    where: { id },
  })) as any;
  if (!item) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  const status = await expireIfNeeded(item.id, item.expiresAt, item.status);

  const member = await prisma.member.findFirst({
    where: { id: item.memberId ?? undefined },
    select: { rpName: true, discordId: true },
  });

  const apiStatus = mapStatusToApi(status);

  const auditLogs = await getEntityAuditLogs("Sanction", item.id, 50);

  return NextResponse.json({
    ok: true,
    data: {
      id: item.id,
      memberId: item.memberId ?? null,
      memberDiscordId: member?.discordId ?? item.discordId,
      memberName: member?.rpName ?? "Unknown",
      type: item.type,
      status: apiStatus,
      reason: item.reason ?? null,
      startAt: item.startAt.toISOString(),
      endAt: toIso(item.endAt),
      expiresAt: toIso(item.expiresAt),
      closedAt: apiStatus === "CLOSED" ? item.updatedAt.toISOString() : null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      discordStatus: item.discordStatus,
      discordAppliedAt: toIso(item.discordAppliedAt),
      discordError: item.discordError ?? null,
    },
    audit: auditLogs,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const session = (guard as any).session;
  const actorId = session?.user?.id ?? session?.userId;
  if (!actorId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const existing = await prisma.sanction.findUnique({
    where: { id },
    select: {
      id: true,
      familyId: true,
      discordId: true,
      type: true,
      status: true,
      reason: true,
      startAt: true,
      expiresAt: true,
      endAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!existing) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const updateData: Record<string, any> = {};
  const changed: Record<string, any> = {};

  if ("type" in body) {
    const value = String(body.type ?? "").trim().toUpperCase();
    if (!isValidType(value)) {
      return NextResponse.json({ ok: false, error: "INVALID_TYPE" }, { status: 400 });
    }
    updateData.type = value;
    changed.type = value;
  }

  if ("reason" in body) {
    const value = String(body.reason ?? "").trim();
    updateData.reason = value || "-";
    changed.reason = updateData.reason;
  }

  if ("endAt" in body) {
    const raw = String(body.endAt ?? "").trim();
    if (!raw) {
      updateData.endAt = null;
    } else {
      const parsed = parseDate(raw);
      if (!parsed) {
        return NextResponse.json({ ok: false, error: "INVALID_END_AT" }, { status: 400 });
      }
      updateData.endAt = parsed;
    }
    changed.endAt = updateData.endAt;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ ok: false, error: "NO_FIELDS" }, { status: 400 });
  }

  if (existing.status === "ACTIVE" && updateData.endAt && updateData.endAt.getTime() < Date.now()) {
    updateData.status = "EXPIRED";
    changed.status = "EXPIRED";
  }

  const updated = (await prisma.sanction.update({
    where: { id },
    data: updateData,
  })) as any;

  await auditStaffAction(actorId, session?.user?.name ?? null, "SANCTION_UPDATE", "Sanction", updated.id, {
    familyId: updated.familyId,
    entityName: undefined,
    meta: { changed },
  });

  const member = await prisma.member.findFirst({
    where: { discordId: updated.discordId, familyId: updated.familyId },
    select: { rpName: true },
  });

  const apiStatus = mapStatusToApi(updated.status);
  return NextResponse.json({
    ok: true,
    data: {
      id: updated.id,
      memberId: updated.memberId ?? null,
      memberName: member?.rpName ?? "Unknown",
      type: updated.type,
      status: apiStatus,
      reason: updated.reason ?? null,
      startAt: updated.startAt.toISOString(),
      endAt: toIso(updated.endAt),
      expiresAt: toIso(updated.expiresAt),
      closedAt: apiStatus === "CLOSED" ? updated.updatedAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      discordStatus: updated.discordStatus,
      discordAppliedAt: toIso(updated.discordAppliedAt),
      discordError: updated.discordError ?? null,
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const session = (guard as any).session;
  const actorId = session?.user?.id ?? session?.userId;
  if (!actorId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.sanction.findUnique({
        where: { id },
        select: {
          id: true,
          familyId: true,
          discordId: true,
          discordStatus: true,
          type: true,
          outboxJobId: true,
        },
      });

      if (!existing) {
        return { notFound: true as const };
      }

      let outboxStatus: string | null = null;
      let outboxDeleted = false;

      if (existing.discordStatus === "APPLIED") {
        return {
          blocked: true as const,
          blockReason: "ALREADY_APPLIED" as const,
          outboxStatus,
          outboxJobId: existing.outboxJobId ?? null,
        };
      }

      if (existing.outboxJobId) {
        const outbox = await tx.discordOutbox.findUnique({
          where: { id: existing.outboxJobId },
          select: { id: true, status: true },
        });

        if (outbox) {
          outboxStatus = outbox.status;

          if (outbox.status === "PENDING") {
            await tx.discordOutbox.delete({ where: { id: outbox.id } });
            outboxDeleted = true;
          } else if (SANCTION_DELETE_BLOCKING_OUTBOX_STATUSES.includes(outbox.status as any)) {
            return {
              blocked: true as const,
              blockReason: "OUTBOX_ALREADY_SENT_OR_RUNNING" as const,
              outboxStatus,
              outboxJobId: outbox.id,
            };
          } else {
            await tx.discordOutbox.delete({ where: { id: outbox.id } });
            outboxDeleted = true;
          }
        }
      }

      const deleted = await tx.sanction.delete({
        where: { id: existing.id },
        select: {
          id: true,
          familyId: true,
          discordId: true,
          type: true,
        },
      });

      return {
        notFound: false as const,
        blocked: false as const,
        deleted,
        outboxStatus,
        outboxDeleted,
      };
    });

    if (result.notFound) {
      return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    }

    if (result.blocked) {
      const isAppliedBlock = result.blockReason === "ALREADY_APPLIED";
      return NextResponse.json(
        {
          ok: false,
          error: isAppliedBlock
            ? "SANCTION_DELETE_BLOCKED_ALREADY_APPLIED"
            : "SANCTION_DELETE_BLOCKED_OUTBOX_ALREADY_SENT_OR_RUNNING",
          details: {
            outboxJobId: result.outboxJobId,
            outboxStatus: result.outboxStatus,
            message: isAppliedBlock
              ? "Une sanction déjà appliquée ne peut pas être supprimée. Utilisez plutôt Clear ou Clôturer."
              : "Impossible de supprimer: le job Discord lié est déjà envoyé ou en cours de traitement.",
          },
        },
        { status: 409 }
      );
    }

    await auditStaffAction(
      actorId,
      session?.user?.name ?? null,
      "SANCTION_DELETE",
      "Sanction",
      result.deleted.id,
      {
        familyId: result.deleted.familyId,
        meta: {
          discordId: result.deleted.discordId,
          type: result.deleted.type,
          outboxStatus: result.outboxStatus,
          outboxDeleted: result.outboxDeleted,
        },
      }
    );

    return NextResponse.json({
      ok: true,
      data: {
        id: result.deleted.id,
        outboxDeleted: result.outboxDeleted,
        outboxStatus: result.outboxStatus,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("[DELETE /api/staff/sanctions/[id]]", { id, error: errorMessage });
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
