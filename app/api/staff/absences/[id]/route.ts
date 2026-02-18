import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePrivileged } from "@/lib/guards";
import { getSession } from "@/auth";
import { enqueueMessageFromTemplate, getOrCreateDiscordConfig } from "@/lib/discord/discord";

const STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELED"] as const;

function isValidStatus(value: string) {
  return STATUSES.includes(value as (typeof STATUSES)[number]);
}

function canChangeStatus(current: string, next: string) {
  if (current === next) return true;
  if (current === "PENDING") return ["APPROVED", "REJECTED", "CANCELED"].includes(next);
  if (current === "APPROVED") return next === "CANCELED";
  if (current === "REJECTED") return next === "CANCELED";
  return false;
}

function parseDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const item = await prisma.absence.findUnique({ where: { id } });
  if (!item) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data: item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const session = await getSession();
  const actorId = session?.user?.id;
  if (!actorId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const existing = await prisma.absence.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const updateData: Record<string, any> = {};
  const changed: Record<string, any> = {};

  if ("reason" in body) {
    const value = String(body.reason ?? "").trim();
    updateData.reason = value || null;
    changed.reason = updateData.reason;
  }

  if ("notes" in body) {
    const value = String(body.notes ?? "").trim();
    updateData.notes = value || null;
    changed.notes = updateData.notes;
  }

  let startAt = existing.startAt;
  let endAt = existing.endAt;

  if ("startAt" in body) {
    const raw = String(body.startAt ?? "").trim();
    if (!raw) {
      return NextResponse.json({ ok: false, error: "MISSING_START_AT" }, { status: 400 });
    }
    const parsed = parseDate(raw);
    if (!parsed) {
      return NextResponse.json({ ok: false, error: "INVALID_START_AT" }, { status: 400 });
    }
    startAt = parsed;
    updateData.startAt = parsed;
    changed.startAt = parsed;
  }

  if ("endAt" in body) {
    const raw = String(body.endAt ?? "").trim();
    if (!raw) {
      return NextResponse.json({ ok: false, error: "MISSING_END_AT" }, { status: 400 });
    }
    const parsed = parseDate(raw);
    if (!parsed) {
      return NextResponse.json({ ok: false, error: "INVALID_END_AT" }, { status: 400 });
    }
    endAt = parsed;
    updateData.endAt = parsed;
    changed.endAt = parsed;
  }

  if (startAt && endAt && endAt.getTime() < startAt.getTime()) {
    return NextResponse.json({ ok: false, error: "END_BEFORE_START" }, { status: 400 });
  }

  if ("status" in body) {
    const value = String(body.status ?? "").trim();
    if (!isValidStatus(value)) {
      return NextResponse.json({ ok: false, error: "INVALID_STATUS" }, { status: 400 });
    }
    if (!canChangeStatus(existing.status, value)) {
      return NextResponse.json({ ok: false, error: "INVALID_STATUS_TRANSITION" }, { status: 400 });
    }
    updateData.status = value;
    changed.status = value;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ ok: false, error: "NO_FIELDS" }, { status: 400 });
  }

  const updated = await prisma.absence.update({
    where: { id },
    data: updateData,
  });

  const statusChanged = updateData.status && updateData.status !== existing.status;
  await prisma.auditLog.create({
    data: {
      familyId: updated.familyId,
      actorId,
      action: statusChanged ? "status_change" : "update",
      entity: "Absence",
      entityId: updated.id,
      meta: statusChanged
        ? { oldStatus: existing.status, newStatus: updated.status, changed }
        : { changed },
    },
  });

  if (statusChanged && updated.status === "APPROVED") {
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
      console.warn("discord enqueue absence.approved failed", err);
    }
  }

  return NextResponse.json({ ok: true, data: updated });
}
