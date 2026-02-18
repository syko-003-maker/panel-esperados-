import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePrivileged } from "@/lib/guards";
import {
  AttendanceStatus,
  computeAttendanceCounts,
  ensureRows,
  isMeetingLocked,
  parseMeetingNotes,
  serializeMeetingNotes,
  DEFAULT_MEETING_FAMILY_ID,
} from "@/lib/meetings-legacy";

function logMeeting(action: string, meetingId: string, locked: boolean) {
  if (process.env.NODE_ENV === "production") return;
  console.log("[meetings]", { action, meetingId, locked });
}

function normalizeStatus(value: unknown): AttendanceStatus {
  const raw = String(value ?? "").trim().toUpperCase();
  const allowed: AttendanceStatus[] = [
    "UNKNOWN",
    "PRESENT",
    "LATE",
    "EXCUSED",
    "ABSENT_JUSTIFIED",
    "ABSENT_UNJUSTIFIED",
  ];
  return allowed.includes(raw as AttendanceStatus) ? (raw as AttendanceStatus) : "UNKNOWN";
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const discordId = String((body as any).discordId ?? "").trim();
  if (!discordId) {
    return NextResponse.json({ ok: false, error: "MISSING_DISCORD_ID" }, { status: 400 });
  }

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true, notes: true, updatedAt: true },
  });
  if (!meeting) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  const payload = parseMeetingNotes(meeting.notes ?? null);
  const currentStatus = payload.status ? String(payload.status).trim().toUpperCase() : "OPEN";
  if (isMeetingLocked(currentStatus, payload.lockedAt ?? null)) {
    return NextResponse.json({ ok: false, error: "MEETING_LOCKED" }, { status: 409 });
  }

  const nextStatus = "status" in body ? normalizeStatus((body as any).status) : null;
  const nextNote = "note" in body ? String((body as any).note ?? "").trim() : null;

  if (nextStatus === null && nextNote === null) {
    return NextResponse.json({ ok: false, error: "NO_FIELDS" }, { status: 400 });
  }

  let memberName = "Unknown";

  const members = await prisma.member.findMany({
    where: { familyId: DEFAULT_MEETING_FAMILY_ID },
    select: { discordId: true, rpName: true },
  });
  const matchedMember = members.find(
    (member) => String(member.discordId ?? "").trim() === discordId
  );
  if (matchedMember?.rpName) {
    memberName = matchedMember.rpName;
  }

  const ensured = ensureRows(payload, members);
  let rows = ensured.rows.map((row) => {
    if (row.discordId !== discordId) return row;
    return {
      ...row,
      status: nextStatus ?? row.status,
      note: nextNote ?? row.note,
    };
  });
  if (!rows.some((row) => row.discordId === discordId)) {
    rows = [
      ...rows,
      {
        discordId,
        name: memberName,
        status: nextStatus ?? "UNKNOWN",
        note: nextNote ?? "",
      },
    ];
  }

  const nextPayload = { ...ensured, rows };
  const updated = await prisma.meeting.update({
    where: { id: meeting.id },
    data: { notes: serializeMeetingNotes(nextPayload) },
    select: { updatedAt: true },
  });

  const counts = computeAttendanceCounts(rows);
  const updatedRow = rows.find((row) => row.discordId === discordId);
  const locked = isMeetingLocked(currentStatus, payload.lockedAt ?? null);

  logMeeting("row", meeting.id, locked);

  return NextResponse.json({
    ok: true,
    row: updatedRow ?? null,
    counts,
    locked,
    updatedAt: updated.updatedAt.toISOString(),
  });
}
