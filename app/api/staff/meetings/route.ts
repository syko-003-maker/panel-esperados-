import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireEncadrantOrAbove } from "@/lib/guards";
import { getSession } from "@/auth";
import { resolveFamilyId } from "@/lib/family";
import { getISOWeekKey } from "@/lib/meetings-legacy";
import {
  buildMeetingClientRow,
  computeMeetingCounts,
  buildMeetingRowSnapshot,
  DEFAULT_MEETING_FAMILY_ID,
  isMeetingLocked,
} from "@/lib/meetings";
import { isStaffMeetingScopeMember } from "@/lib/staff/member-scope";
import { ensureFreshFamilyPlaytime } from "@/lib/staff/ensure-fresh-playtime";
import { sendPushToDiscordIds } from "@/lib/push";

function buildMeetingListItem(meeting: {
  id: string;
  title: string | null;
  type: string;
  status: string;
  summary: string | null;
  summaryText: string | null;
  finalizedAt: Date | null;
  meetingDate: Date;
  weekKey: string;
  createdAt: Date;
  updatedAt: Date;
  rows: Array<{
    id: string;
    rpNameSnapshot: string;
    discordIdSnapshot: string | null;
    playtimeMinutes: number;
    attendanceStatus: string;
    decisionType: string;
    staffNote: string | null;
    isJustified: boolean;
    updatedAt: Date;
  }>;
  _count: { decisions: number; attendances: number; rows: number };
}) {
  const rows = meeting.rows.map((row) => buildMeetingClientRow(row));
  return {
    id: meeting.id,
    scheduledAt: meeting.meetingDate.toISOString(),
    weekKey: meeting.weekKey,
    title: meeting.title ?? `Réunion ${meeting.weekKey}`,
    type: meeting.type,
    status: meeting.status,
    locked: isMeetingLocked(meeting.status),
    finalizedAt: meeting.finalizedAt?.toISOString() ?? null,
    summary: meeting.summaryText ?? meeting.summary,
    decisionsCount: meeting._count.decisions,
    attendancesCount: meeting._count.attendances || meeting._count.rows,
    counts: computeMeetingCounts(rows),
    createdAt: meeting.createdAt.toISOString(),
    updatedAt: meeting.updatedAt.toISOString(),
  };
}

export async function GET(req: Request) {
  const guard = await requireEncadrantOrAbove();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const weekKeyParam = searchParams.get("weekKey");
  const statusParam = searchParams.get("status");

  const familyDbId = await resolveFamilyId(DEFAULT_MEETING_FAMILY_ID);

  const where: Record<string, unknown> = { familyId: familyDbId };
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
      summary: true,
      summaryText: true,
      finalizedAt: true,
      createdAt: true,
      updatedAt: true,
      rows: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          rpNameSnapshot: true,
          discordIdSnapshot: true,
          playtimeMinutes: true,
          attendanceStatus: true,
          sanctionType: true,
          decisionType: true,
          staffNote: true,
          isJustified: true,
          updatedAt: true,
        },
      },
      _count: {
        select: {
          decisions: true,
          attendances: true,
          rows: true,
        },
      },
    },
  });

  const data = meetings.map(buildMeetingListItem);

  return NextResponse.json({ ok: true, data });
}

export async function POST(req: Request) {
  const guard = await requireEncadrantOrAbove();
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
  const description = String(body?.meetingNote ?? body?.notes ?? body?.description ?? "").trim() || null;

  const existing = await prisma.meeting.findUnique({ where: { weekKey } });
  if (existing) {
    return NextResponse.json({ ok: false, error: "WEEKKEY_EXISTS" }, { status: 409 });
  }

  await ensureFreshFamilyPlaytime(DEFAULT_MEETING_FAMILY_ID);

  const familyId = await resolveFamilyId(DEFAULT_MEETING_FAMILY_ID);

  const members = await prisma.member.findMany({
    where: { familyId, isGhost: false },
    select: {
      id: true,
      source: true,
      discordId: true,
      rpName: true,
      grade: true,
      isActive: true,
      discordRoleIds: true,
      rankRoleId: true,
      rankLabel: true,
      steamId: true,
      playtime7d: true,
      discordInGuild: true,
      missingFromLygSince: true,
    },
    orderBy: { rpName: "asc" },
  });

  const activeMembers = members.filter(isStaffMeetingScopeMember);
  const rowSnapshots = activeMembers.map((member, index) => ({
    ...buildMeetingRowSnapshot(member),
    attendanceStatus: "NOT_CONCERNED" as const,
    decisionType: "NONE" as const,
    sanctionType: null,
    sanctionReason: null,
    staffNote: null,
    sortOrder: index,
  }));

  const meeting = await prisma.meeting.create({
    data: {
      // FK Meeting→Family : `rows: { create }` est une relation, on ne peut
      // donc plus passer `familyId` en scalaire dans le meme create.
      family: { connect: { id: familyId } },
      meetingDate,
      weekKey,
      title,
      status: "DRAFT",
      createdByUserId: actorId,
      createdById: actorId,
      description,
      rows: {
        create: rowSnapshots,
      },
    },
    select: {
      id: true,
      title: true,
      type: true,
      status: true,
      meetingDate: true,
      weekKey: true,
      description: true,
      summary: true,
      summaryText: true,
      summaryChannelId: true,
      summaryPostedAt: true,
      finalizedAt: true,
      closedAt: true,
      updatedAt: true,
      rows: {
        orderBy: { sortOrder: "asc" },
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
      },
    },
  });

  // Notifie les membres concernés de la date de réunion (fire-and-forget).
  {
    const ids = activeMembers
      .map((m) => m.discordId)
      .filter((x): x is string => !!x);
    const dateFr = meeting.meetingDate.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Paris",
    });
    void sendPushToDiscordIds(ids, {
      title: "📅 Réunion planifiée",
      body: `${meeting.title ?? `Réunion ${meeting.weekKey}`} — ${dateFr}.`,
      url: "/dashboard",
      tag: "meeting-" + meeting.id,
    }).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    meeting: {
      id: meeting.id,
      scheduledAt: meeting.meetingDate.toISOString(),
      title: meeting.title ?? `Réunion ${meeting.weekKey}`,
      status: meeting.status,
      type: meeting.type,
      weekKey: meeting.weekKey,
      locked: isMeetingLocked(meeting.status),
      counts: computeMeetingCounts(meeting.rows),
      updatedAt: meeting.updatedAt.toISOString(),
      meetingNote: meeting.description ?? "",
      summary: meeting.summaryText ?? meeting.summary,
      finalizedAt: meeting.finalizedAt?.toISOString() ?? null,
      closedAt: meeting.closedAt?.toISOString() ?? null,
      discord: {
        channelId: meeting.summaryChannelId ?? null,
        messageId: null,
        lastPublishedAt: meeting.summaryPostedAt?.toISOString() ?? null,
      },
      rows: meeting.rows.map((row) => buildMeetingClientRow(row)),
    },
  });
}
