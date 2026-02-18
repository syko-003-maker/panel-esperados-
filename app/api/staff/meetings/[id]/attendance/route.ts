import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePrivileged } from "@/lib/guards";
import { DEFAULT_FAMILY_ID } from "@/lib/family";

type AttendanceInput = {
  memberDiscordId: string;
  present: boolean;
  note?: string | null;
};

/**
 * GET /api/staff/meetings/[id]/attendance
 * Get attendance for a meeting
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const { id: meetingId } = await params;

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, status: true, type: true },
  });

  if (!meeting) {
    return NextResponse.json({ ok: false, error: "Meeting not found" }, { status: 404 });
  }

  // Get all attendances
  const attendances = await prisma.meetingAttendance.findMany({
    where: { meetingId },
    orderBy: { createdAt: "asc" },
  });

  // Get all active members for the family
  const members = await prisma.member.findMany({
    where: { familyId: DEFAULT_FAMILY_ID, isActive: true },
    select: { discordId: true, rpName: true, grade: true, gradeLevel: true },
    orderBy: [{ gradeLevel: "desc" }, { rpName: "asc" }],
  });

  // Build attendance map
  const attendanceMap = new Map(attendances.map((a) => [a.memberDiscordId, a]));

  // Merge members with attendance
  const mergedAttendance = members
    .filter((m) => m.discordId)
    .map((member) => {
      const attendance = attendanceMap.get(member.discordId!);
      return {
        memberDiscordId: member.discordId!,
        rpName: member.rpName,
        grade: member.grade,
        gradeLevel: member.gradeLevel,
        present: attendance?.present ?? false,
        note: attendance?.note ?? null,
        hasAttendance: !!attendance,
      };
    });

  const counts = {
    total: mergedAttendance.length,
    present: mergedAttendance.filter((a) => a.present).length,
    absent: mergedAttendance.filter((a) => !a.present && a.hasAttendance).length,
    unknown: mergedAttendance.filter((a) => !a.hasAttendance).length,
  };

  return NextResponse.json({
    ok: true,
    meetingStatus: meeting.status,
    meetingType: meeting.type,
    attendance: mergedAttendance,
    counts,
  });
}

/**
 * POST /api/staff/meetings/[id]/attendance
 * Upsert attendance (bulk)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const { id: meetingId } = await params;

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { status: true },
  });

  if (!meeting) {
    return NextResponse.json({ ok: false, error: "Meeting not found" }, { status: 404 });
  }

  if (meeting.status === "FINAL") {
    return NextResponse.json(
      { ok: false, error: "Meeting is finalized, attendance cannot be modified" },
      { status: 409 }
    );
  }

  const body = await req.json();
  const attendances: AttendanceInput[] = body.attendance;

  if (!Array.isArray(attendances)) {
    return NextResponse.json({ ok: false, error: "attendance must be an array" }, { status: 400 });
  }

  const results = { upserted: 0, errors: 0 };

  for (const att of attendances) {
    if (!att.memberDiscordId) {
      results.errors++;
      continue;
    }

    try {
      await prisma.meetingAttendance.upsert({
        where: {
          meetingId_memberDiscordId: {
            meetingId,
            memberDiscordId: att.memberDiscordId,
          },
        },
        create: {
          meetingId,
          memberDiscordId: att.memberDiscordId,
          present: att.present,
          note: att.note,
        },
        update: {
          present: att.present,
          note: att.note,
        },
      });
      results.upserted++;
    } catch {
      results.errors++;
    }
  }

  return NextResponse.json({ ok: true, ...results });
}
