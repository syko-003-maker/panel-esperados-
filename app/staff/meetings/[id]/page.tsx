import { redirect } from "next/navigation";
import { getSession } from "@/auth";
import { prisma } from "@/lib/db";
import MeetingSheetClient from "./meeting-sheet-client";
import { MeetingDecisionsClient } from "./meeting-decisions-client";

export default async function MeetingSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  const user = session.user as any;
  if (!user?.isStaff) {
    redirect("/");
  }

  // Fetch meeting to get status
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true, status: true, type: true, title: true, weekKey: true },
  });

  if (!meeting) {
    redirect("/staff/meetings");
  }

  return (
    <div style={{ padding: 24 }}>
      <MeetingSheetClient meetingId={id} />
      <MeetingDecisionsClient
        meetingId={id}
        meetingStatus={meeting.status}
      />
    </div>
  );
}
