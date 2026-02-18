import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePrivileged } from "@/lib/guards";
import { getSession } from "@/auth";
import { enqueueSanctionNotify } from "@/lib/discord/discord";

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

function mapStatusToApi(status: string) {
  return status;
}

function mapTypeToApi(type: string) {
  if (type === "TEMP_BAN") return "SUSPENSION";
  return type;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const session = await getSession();
  const actorId = session?.user?.id;
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
  if (existing.status === "CLOSED") {
    return NextResponse.json({ ok: false, error: "ALREADY_CLOSED" }, { status: 409 });
  }

  const updated = await prisma.sanction.update({
    where: { id },
    data: { status: "CLOSED" },
  });

  await prisma.auditLog.create({
    data: {
      familyId: updated.familyId,
      actorId,
      action: "close",
      entity: "Sanction",
      entityId: updated.id,
      meta: { status: updated.status },
    },
  });

  const member = await prisma.member.findFirst({
    where: { discordId: updated.discordId, familyId: updated.familyId },
    select: { rpName: true },
  });

  const staffName = session?.user?.name ?? actorId;
  await enqueueSanctionNotify({
    familyId: updated.familyId,
    action: "CLOSED",
    sanctionId: updated.id,
    memberName: member?.rpName ?? "Unknown",
    memberDiscordId: updated.discordId ?? null,
    type: mapTypeToApi(updated.type),
    status: mapStatusToApi(updated.status),
    reason: updated.reason ?? null,
    amount: null,
    startAt: updated.startAt,
    endAt: updated.endAt,
    durationHours: null,
    staffName,
    updatedAt: updated.updatedAt,
  });

  const apiStatus = mapStatusToApi(updated.status);
  return NextResponse.json({
    ok: true,
    data: {
      id: updated.id,
      memberId: null,
      memberName: member?.rpName ?? "Unknown",
      type: mapTypeToApi(updated.type),
      status: apiStatus,
      reason: updated.reason ?? null,
      amount: null,
      durationHours: null,
      startAt: updated.startAt.toISOString(),
      endAt: toIso(updated.endAt),
      closedAt: apiStatus === "CLOSED" ? updated.updatedAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}
