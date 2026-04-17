import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePrivileged } from "@/lib/guards";
import {
  buildMeetingClientRow,
  buildMeetingRowSnapshot,
  DEFAULT_MEETING_FAMILY_ID,
  isApprovedAbsenceValidForMeeting,
  isMeetingLocked,
} from "@/lib/meetings";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { meetingDate: true, familyId: true },
  });
  if (!meeting) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  const rows = await prisma.meetingRow.findMany({
    where: { meetingId: id },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      memberId: true,
      rpNameSnapshot: true,
      gradeSnapshot: true,
      steamIdSnapshot: true,
      discordIdSnapshot: true,
      playtimeMinutes: true,
      attendanceStatus: true,
      sanctionType: true,
      decisionType: true,
      sanctionReason: true,
      staffNote: true,
      isJustified: true,
      sortOrder: true,
      updatedAt: true,
    },
  });

  const memberIds = Array.from(new Set(rows.map((row) => row.memberId).filter((value): value is string => Boolean(value))));
  const discordIds = Array.from(
    new Set(rows.map((row) => row.discordIdSnapshot).filter((value): value is string => typeof value === "string" && value.trim() !== ""))
  );

  const relatedAbsences = memberIds.length || discordIds.length
    ? await prisma.absence.findMany({
        where: {
          familyId: meeting.familyId ?? DEFAULT_MEETING_FAMILY_ID,
          status: "APPROVED",
          startAt: { lte: meeting.meetingDate },
          endAt: { gte: meeting.meetingDate },
          OR: [
            ...(memberIds.length > 0 ? [{ memberId: { in: memberIds } }] : []),
            ...(discordIds.length > 0 ? [{ discordId: { in: discordIds } }] : []),
          ],
        },
        select: {
          id: true,
          memberId: true,
          discordId: true,
          status: true,
          startAt: true,
          endAt: true,
          notes: true,
        },
      })
    : [];

  const rowsWithJustification = rows.map((row) => {
    const isPresent = row.attendanceStatus === "PRESENT";
    const matchingAbsence = relatedAbsences.find((absence) => {
      const sameMember = row.memberId ? absence.memberId === row.memberId : false;
      const sameDiscord = row.discordIdSnapshot ? absence.discordId === row.discordIdSnapshot : false;
      if (!sameMember && !sameDiscord) return false;
      return isApprovedAbsenceValidForMeeting(absence, meeting.meetingDate);
    });

    if (!matchingAbsence || isPresent) {
      return row;
    }

    return {
      ...row,
      attendanceStatus: "JUSTIFIED",
      isJustified: true,
      staffNote:
        row.staffNote && row.staffNote.trim() !== ""
          ? row.staffNote
          : "Absence approuvée : présence justifiée",
    };
  });

  return NextResponse.json({ ok: true, rows: rowsWithJustification.map((row) => buildMeetingClientRow(row)) });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { status: true },
  });
  if (!meeting) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }
  if (isMeetingLocked(meeting.status)) {
    return NextResponse.json({ ok: false, error: "MEETING_LOCKED" }, { status: 409 });
  }

  const body = await req.json().catch(() => null);
  const memberId = String(body?.memberId ?? "").trim();
  const discordId = String(body?.discordId ?? "").trim();
  const rpName = String(body?.rpName ?? "").trim();

  let snapshot = null;
  if (memberId) {
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        rpName: true,
        grade: true,
        rankLabel: true,
        steamId: true,
        discordId: true,
        playtime7d: true,
      },
    });
    if (!member) {
      return NextResponse.json({ ok: false, error: "MEMBER_NOT_FOUND" }, { status: 404 });
    }
    snapshot = buildMeetingRowSnapshot(member);
  } else if (discordId || rpName) {
    snapshot = buildMeetingRowSnapshot({
      id: null,
      rpName: rpName || discordId || "Membre manuel",
      discordId: discordId || null,
      grade: null,
      rankLabel: null,
      steamId: null,
      playtime7d: 0,
    });
  }

  if (!snapshot) {
    return NextResponse.json({ ok: false, error: "INVALID_ROW_INPUT" }, { status: 400 });
  }

  const row = await prisma.meetingRow.create({
    data: {
      meetingId: id,
      ...snapshot,
      sortOrder: await prisma.meetingRow.count({ where: { meetingId: id } }),
    },
    select: {
      id: true,
      rpNameSnapshot: true,
      gradeSnapshot: true,
      steamIdSnapshot: true,
      discordIdSnapshot: true,
      playtimeMinutes: true,
      attendanceStatus: true,
      sanctionType: true,
      decisionType: true,
      sanctionReason: true,
      staffNote: true,
      isJustified: true,
      sortOrder: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ ok: true, row: buildMeetingClientRow(row) });
}
