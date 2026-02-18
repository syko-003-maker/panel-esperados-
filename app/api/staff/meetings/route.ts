import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { getSession } from "@/auth";
import {
  AttendanceStatus,
  getISOWeekKey,
  serializeMeetingNotes,
  DEFAULT_MEETING_FAMILY_ID,
  buildMeetingDTO,
} from "@/lib/meetings-legacy";
function logMeeting(action: string, meetingId: string, locked: boolean) {
  if (process.env.NODE_ENV === "production") return;
  console.log("[meetings]", { action, meetingId, locked });
}

export async function GET(req: Request) {
  // ✅ PATCH: Unified staff protection (session + isStaff + member linked)
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const weekKeyParam = searchParams.get("weekKey");
  const statusParam = searchParams.get("status");

  const where: Record<string, unknown> = {};
  if (weekKeyParam) where.weekKey = weekKeyParam;
  if (statusParam) where.status = statusParam;

  const meetings = await prisma.meeting.findMany({
    where,
    orderBy: { meetingDate: "desc" },
    select: {
      id: true,
      title: true,
      meetingDate: true,
      weekKey: true,
      type: true,
      status: true,
      notes: true,
      summary: true,
      finalizedAt: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          decisions: true,
          attendances: true,
        },
      },
    },
  });

  // Build DTOs with both legacy and new fields
  const data = meetings.map((meeting) => {
    const legacyDTO = buildMeetingDTO({
      id: meeting.id,
      meetingDate: meeting.meetingDate,
      weekKey: meeting.weekKey,
      notes: meeting.notes,
      updatedAt: meeting.updatedAt,
    });

    return {
      ...legacyDTO,
      title: meeting.title,
      type: meeting.type,
      status: meeting.status,
      summary: meeting.summary,
      finalizedAt: meeting.finalizedAt,
      decisionsCount: meeting._count.decisions,
      attendancesCount: meeting._count.attendances,
    };
  });

  return NextResponse.json({ ok: true, data });
}

export async function POST(req: Request) {
  // ✅ PATCH: Unified staff protection (session + isStaff + member linked)
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const session = await getSession();
  const actorId = session?.user?.id ?? (session as any)?.userId;
  if (!actorId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const scheduledAtRaw = String(body?.scheduledAt ?? "").trim();
  const meetingDate = scheduledAtRaw ? new Date(scheduledAtRaw) : new Date();
  if (Number.isNaN(meetingDate.getTime())) {
    return NextResponse.json({ ok: false, error: "INVALID_SCHEDULED_AT" }, { status: 400 });
  }

  const weekKey = getISOWeekKey(meetingDate);
  const title = String(body?.title ?? `Reunion ${weekKey}`).trim() || `Reunion ${weekKey}`;

  const existing = await prisma.meeting.findUnique({ where: { weekKey } });
  if (existing) {
    return NextResponse.json({ ok: false, error: "WEEKKEY_EXISTS" }, { status: 409 });
  }

  const members = await prisma.member.findMany({
    where: { familyId: DEFAULT_MEETING_FAMILY_ID },
    select: { id: true, discordId: true, rpName: true },
    orderBy: { rpName: "asc" },
  });

  const rows = members
    .filter((member) => member.discordId)
    .map((member) => ({
      discordId: String(member.discordId),
      name: member.rpName ?? "Unknown",
      status: "UNKNOWN" as AttendanceStatus,
      note: "",
    }));

  const payload = {
    version: 1 as const,
    weekKey,
    title,
    status: "SCHEDULED",
    lockedAt: null,
    meetingNote: "",
    discord: {},
    rows,
  };

  const meeting = await prisma.meeting.create({
    data: {
      meetingDate,
      weekKey,
      title,
      status: "DRAFT",
      createdByUserId: actorId,
      notes: serializeMeetingNotes(payload),
    },
    select: { id: true, title: true, meetingDate: true, weekKey: true, type: true, status: true, notes: true, updatedAt: true },
  });

  const dto = buildMeetingDTO({
    id: meeting.id,
    meetingDate: meeting.meetingDate,
    weekKey: meeting.weekKey,
    notes: meeting.notes,
    updatedAt: meeting.updatedAt,
  });

  logMeeting("create", meeting.id, dto.locked);

  return NextResponse.json({
    ok: true,
    meeting: {
      ...dto,
      rows,
      meetingNote: payload.meetingNote ?? "",
      discord: payload.discord ?? {},
    },
  });
}
