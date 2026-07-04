import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireEncadrantOrAbove } from "@/lib/guards";
import { getSession } from "@/auth";
import { computeMeetingSummary } from "@/lib/meetings";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireEncadrantOrAbove();
  if (guard instanceof Response) return guard;

  const session = await getSession();
  const actorId = session?.user?.id ?? (session as any)?.userId ?? null;
  const body = await req.json().catch(() => null);

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: {
      id: true,
      familyId: true,
      title: true,
      weekKey: true,
      meetingDate: true,
      status: true,
      description: true,
      summaryText: true,
      summaryChannelId: true,
      summaryPostedAt: true,
      rows: {
        orderBy: { sortOrder: "asc" },
        select: {
          rpNameSnapshot: true,
          discordIdSnapshot: true,
          playtimeMinutes: true,
          attendanceStatus: true,
          sanctionType: true,
          decisionType: true,
          sanctionReason: true,
          staffNote: true,
          isJustified: true,
        },
      },
    },
  });
  if (!meeting) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  if (meeting.status === "FINAL" || meeting.status === "CANCELED") {
    return NextResponse.json({ ok: false, error: "INVALID_STATUS_FOR_CLOSE" }, { status: 409 });
  }

  if (meeting.status === "CLOSED") {
    return NextResponse.json({ ok: true, alreadyClosed: true, locked: true });
  }

  const summary = computeMeetingSummary(meeting.rows, {
    meetingDate: meeting.meetingDate,
    notes: meeting.description,
  });

  // Persist the channel id (provided by caller or already stored) so publish can use it later.
  // No Discord message is sent here — that is solely the responsibility of the /publish route.
  const channelId = String(body?.channelId ?? "").trim() || meeting.summaryChannelId || null;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.meeting.update({
      where: { id: meeting.id },
      data: {
        status: "CLOSED",
        closedAt: now,
        closedById: actorId,
        summary: `Réunion clôturée: ${summary.demoteCount} démote(s), ${summary.blacklistCount} blacklist(s), ${summary.reservistCount} réserviste(s), ${summary.warningCount + summary.warningOralCount} avertissement(s)`,
        summaryText: summary.summaryText,
        summaryChannelId: channelId,
        summaryPostedAt: null,
      },
    });

    await tx.meetingAttendance.deleteMany({ where: { meetingId: meeting.id } });
    const attendanceRows = meeting.rows
      .filter((row) => row.discordIdSnapshot)
      .map((row) => ({
        meetingId: meeting.id,
        memberDiscordId: String(row.discordIdSnapshot),
        present: row.attendanceStatus === "PRESENT",
        note: row.sanctionReason ?? row.staffNote ?? null,
      }));
    if (attendanceRows.length > 0) {
      await tx.meetingAttendance.createMany({ data: attendanceRows });
    }
  });

  return NextResponse.json({
    ok: true,
    meeting: {
      id: meeting.id,
      status: "CLOSED",
      lockedAt: now.toISOString(),
      updatedAt: now.toISOString(),
      summary: summary.summaryText,
      channelId,
    },
  });
}
