import { redirect } from "next/navigation";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { MeetingDecisionsClient } from "./meeting-decisions-client";
import { PageShell } from "@/components/staff/ui/PageShell";
import { CalendarDays } from "lucide-react";

export default async function MeetingSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
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
    <PageShell
      title={meeting.title || "Réunion staff"}
      description={`Suivi de la réunion ${meeting.weekKey} et décisions staff.`}
      icon={CalendarDays}
    >
      <MeetingDecisionsClient
        meetingId={id}
        meetingStatus={meeting.status}
      />
    </PageShell>
  );
}
