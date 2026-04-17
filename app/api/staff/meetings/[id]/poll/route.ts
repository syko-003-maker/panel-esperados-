import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePrivileged } from "@/lib/guards";
import {
  buildMeetingClientRow,
  computeMeetingCounts,
  isMeetingLocked,
} from "@/lib/meetings";
import { resolveAvatarHashByDiscordId } from "@/lib/discord/avatar-hash-resolver";

async function buildMeetingPollResponse(id: string) {
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: {
      id: true,
      meetingDate: true,
      weekKey: true,
      title: true,
      status: true,
      description: true,
      summary: true,
      summaryText: true,
      summaryChannelId: true,
      summaryPostedAt: true,
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

  if (!meeting) return null;

  const latestRowUpdate = meeting.rows.reduce<Date | null>((latest, row) => {
    if (!latest || row.updatedAt > latest) return row.updatedAt;
    return latest;
  }, null);
  const updatedAt = latestRowUpdate && latestRowUpdate > meeting.updatedAt ? latestRowUpdate : meeting.updatedAt;
  const avatarHashByDiscordId = await resolveAvatarHashByDiscordId(
    meeting.rows
      .map((row) => row.discordIdSnapshot)
      .filter((value): value is string => typeof value === "string" && value.trim() !== "")
  );

  return {
    id: meeting.id,
    scheduledAt: meeting.meetingDate.toISOString(),
    title: meeting.title ?? `Réunion ${meeting.weekKey}`,
    status: meeting.status,
    weekKey: meeting.weekKey,
    locked: isMeetingLocked(meeting.status),
    counts: computeMeetingCounts(meeting.rows),
    updatedAt: updatedAt.toISOString(),
    meetingNote: meeting.description ?? "",
    summary: meeting.summaryText ?? meeting.summary,
    discord: {
      channelId: meeting.summaryChannelId ?? null,
      messageId: null,
      lastPublishedAt: meeting.summaryPostedAt?.toISOString() ?? null,
    },
    rows: meeting.rows.map((row) =>
      buildMeetingClientRow(row, {
        discordAvatarHash: row.discordIdSnapshot ? avatarHashByDiscordId.get(row.discordIdSnapshot) ?? null : null,
      })
    ),
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

  const meeting = await buildMeetingPollResponse(id);
  if (!meeting) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  if (after && new Date(meeting.updatedAt) <= after) {
    return NextResponse.json({ ok: true, changed: false });
  }

  return NextResponse.json({
    ok: true,
    changed: true,
    meeting,
  });
}
