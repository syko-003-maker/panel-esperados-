import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChef } from "@/lib/guards";
import { enqueueMeetingNotifyRecap, enqueueMeetingNotifyUpsert } from "@/lib/discord/discord";
import {
  isMeetingLocked,
  parseMeetingNotes,
  serializeMeetingNotes,
  DEFAULT_MEETING_FAMILY_ID,
} from "@/lib/meetings-legacy";

function logMeeting(action: string, meetingId: string, locked: boolean) {
  if (process.env.NODE_ENV === "production") return;
  console.log("[meetings]", { action, meetingId, locked });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true, notes: true },
  });
  if (!meeting) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  const payload = parseMeetingNotes(meeting.notes ?? null);
  const currentStatus = payload.status ? String(payload.status).trim().toUpperCase() : "OPEN";
  if (isMeetingLocked(currentStatus, payload.lockedAt ?? null)) {
    return NextResponse.json({ ok: true, locked: true });
  }

  payload.lockedAt = new Date().toISOString();
  payload.status = "DONE";

  const updated = await prisma.meeting.update({
    where: { id: meeting.id },
    data: {
      notes: serializeMeetingNotes(payload),
    },
    select: { id: true, updatedAt: true },
  });

  await enqueueMeetingNotifyUpsert({
    familyId: DEFAULT_MEETING_FAMILY_ID,
    meetingId: meeting.id,
  });
  await enqueueMeetingNotifyRecap({
    familyId: DEFAULT_MEETING_FAMILY_ID,
    meetingId: meeting.id,
  });

  logMeeting("close", updated.id, true);

  return NextResponse.json({
    ok: true,
    meeting: {
      id: updated.id,
      status: payload.status,
      lockedAt: payload.lockedAt,
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}
