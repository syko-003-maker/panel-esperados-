import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { getEntityAuditLogs, auditStaffAction } from "@/lib/audit";

const TYPES = [
  "AVERT_ORAL_PLAYTIME",
  "AVERT_ORAL_REUNION",
  "AVERT_LEGER",
  "AVERT_LOURD",
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

async function expireIfNeeded(sanctionId: string, endAt: Date | null, status: string) {
  if (status !== "ACTIVE" || !endAt || endAt.getTime() >= Date.now()) return status;
  const updated = await prisma.sanction.update({
    where: { id: sanctionId },
    data: { status: "EXPIRED" },
  });
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

  const status = await expireIfNeeded(item.id, item.endAt, item.status);

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

  let explicitEndAt = false;
  if ("endAt" in body) {
    explicitEndAt = true;
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
      closedAt: apiStatus === "CLOSED" ? updated.updatedAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      discordStatus: updated.discordStatus,
      discordAppliedAt: toIso(updated.discordAppliedAt),
      discordError: updated.discordError ?? null,
    },
  });
}
