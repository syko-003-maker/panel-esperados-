import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChef, requirePrivileged } from "@/lib/guards";
import { getSession } from "@/auth";
import {
  AttendanceStatus,
  computeAttendanceCounts,
  ensureRows,
  getISOWeekKey,
  isMeetingLocked,
  parseMeetingNotes,
  serializeMeetingNotes,
  DEFAULT_MEETING_FAMILY_ID,
  buildMeetingDTO,
} from "@/lib/meetings-legacy";

function logMeeting(action: string, meetingId: string, locked: boolean) {
  if (process.env.NODE_ENV === "production") return;
  console.log("[meetings]", { action, meetingId, locked });
}

function mapStatusInput(value: string) {
  const raw = value.trim().toUpperCase();
  if (raw === "CLOSED") return "DONE";
  return raw;
}

async function buildMeetingDetail(meeting: {
  id: string;
  meetingDate: Date;
  weekKey: string;
  notes: string | null;
  updatedAt: Date;
}) {
  const payload = parseMeetingNotes(meeting.notes ?? null);
  const status = payload.status ? String(payload.status).trim().toUpperCase() : "OPEN";
  const locked = isMeetingLocked(status, payload.lockedAt ?? null);

  const members = await prisma.member.findMany({
    where: { familyId: DEFAULT_MEETING_FAMILY_ID },
    select: { discordId: true, rpName: true },
    orderBy: { rpName: "asc" },
  });
  const ensured = ensureRows(payload, members);
  const rows = ensured.rows.map((row) => ({
    ...row,
    updatedAt: meeting.updatedAt.toISOString(),
  }));

  const counts = computeAttendanceCounts(rows);
  const dto = buildMeetingDTO({
    id: meeting.id,
    meetingDate: meeting.meetingDate,
    weekKey: meeting.weekKey,
    notes: meeting.notes,
    updatedAt: meeting.updatedAt,
  });

  return {
    ...dto,
    rows,
    counts,
    locked,
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: {
      id: true,
      meetingDate: true,
      weekKey: true,
      notes: true,
      updatedAt: true,
    },
  });
  if (!meeting) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  const detail = await buildMeetingDetail(meeting);
  return NextResponse.json({ ok: true, meeting: detail });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const session = await getSession();
  const actorId = session?.user?.id ?? (session as any)?.userId;
  if (!actorId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: {
      id: true,
      meetingDate: true,
      weekKey: true,
      notes: true,
      updatedAt: true,
    },
  });
  if (!meeting) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  const payload = parseMeetingNotes(meeting.notes ?? null);
  const currentStatus = payload.status ? String(payload.status).trim().toUpperCase() : "OPEN";
  if (isMeetingLocked(currentStatus, payload.lockedAt ?? null)) {
    return NextResponse.json({ ok: false, error: "MEETING_LOCKED" }, { status: 409 });
  }

  const updateData: Record<string, unknown> = {};
  let payloadChanged = false;

  if ("title" in body) {
    const title = String((body as any).title ?? "").trim();
    if (!title) {
      return NextResponse.json({ ok: false, error: "INVALID_TITLE" }, { status: 400 });
    }
    payload.title = title;
    payloadChanged = true;
  }

  if ("scheduledAt" in body) {
    const raw = String((body as any).scheduledAt ?? "").trim();
    const parsed = raw ? new Date(raw) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ ok: false, error: "INVALID_SCHEDULED_AT" }, { status: 400 });
    }
    const nextWeekKey = getISOWeekKey(parsed);
    updateData.meetingDate = parsed;
    updateData.weekKey = nextWeekKey;
    payload.weekKey = nextWeekKey;
    payloadChanged = true;
  }

  if ("status" in body) {
    const raw = String((body as any).status ?? "");
    const next = mapStatusInput(raw);
    const allowed = ["SCHEDULED", "DONE", "CANCELED"];
    if (!allowed.includes(next)) {
      return NextResponse.json({ ok: false, error: "INVALID_STATUS" }, { status: 400 });
    }
    if (next === "DONE" || next === "CANCELED") {
      const chefGuard = await requireChef();
      if (chefGuard instanceof Response) return chefGuard;
    }
    payload.status = next;
    payloadChanged = true;
  }

  if ("meetingNote" in body || "notes" in body) {
    const noteSource = "meetingNote" in body ? (body as any).meetingNote : (body as any).notes;
    const note = String(noteSource ?? "").trim();
    payload.meetingNote = note || "";
    payloadChanged = true;
  }

  if (payloadChanged) {
    updateData.notes = serializeMeetingNotes(payload);
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ ok: false, error: "NO_FIELDS" }, { status: 400 });
  }

  const updated = await prisma.meeting.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      meetingDate: true,
      weekKey: true,
      notes: true,
      updatedAt: true,
    },
  });

  const detail = await buildMeetingDetail(updated);
  logMeeting("patch", updated.id, detail.locked);
  return NextResponse.json({ ok: true, meeting: detail });
}
