import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePrivileged } from "@/lib/guards";
import {
  computeAttendanceCounts,
  ensureRows,
  isMeetingLocked,
  parseMeetingNotes,
  DEFAULT_MEETING_FAMILY_ID,
  buildMeetingDTO,
} from "@/lib/meetings-legacy";

async function buildMeetingPollResponse(meeting: {
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

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const afterRaw = searchParams.get("after");

  let after: Date | null = null;
  if (afterRaw) {
    const parsed = new Date(afterRaw);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ ok: false, error: "INVALID_AFTER" }, { status: 400 });
    }
    after = parsed;
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

  if (after && meeting.updatedAt <= after) {
    return NextResponse.json({ ok: true, changed: false });
  }

  const detail = await buildMeetingPollResponse(meeting);
  return NextResponse.json({
    ok: true,
    changed: true,
    meeting: detail,
  });
}
