import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePrivileged } from "@/lib/guards";
import { enqueueMeetingNotifyUpsert } from "@/lib/discord/discord";
import { DEFAULT_MEETING_FAMILY_ID } from "@/lib/meetings-legacy";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!meeting) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const channelId = body?.channelId ? String(body.channelId).trim() : "";

  await enqueueMeetingNotifyUpsert({
    familyId: DEFAULT_MEETING_FAMILY_ID,
    meetingId: meeting.id,
    channelId: channelId || null,
  });

  return NextResponse.json({ ok: true });
}
