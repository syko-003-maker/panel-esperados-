import { redirect } from "next/navigation";
import { requireEncadrantOrAbove } from "@/lib/guards";
import { isCurrentSessionFullWriter, isCurrentSessionEncadrantOrAbove } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { MeetingDecisionsClient } from "./meeting-decisions-client";
import { PageShell } from "@/components/staff/ui/PageShell";
import { CalendarDays } from "lucide-react";

export default async function MeetingSheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireEncadrantOrAbove();
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

  // canWrite : Encadrant + EM + Chefs → peuvent gérer la réunion (présence,
  //            notes, warns, réserviste, promotions, publier, finaliser si non-grave).
  // canGrave : EM + Chefs seulement → seuls eux voient démote/blacklist/exclusion
  //            et peuvent finaliser une réunion qui en contient. Le serveur
  //            bloque déjà (403) ; on masque côté UI pour éviter le 403 désagréable.
  const canWrite = await isCurrentSessionEncadrantOrAbove();
  const canGrave = await isCurrentSessionFullWriter();

  return (
    <PageShell
      title={meeting.title || "Réunion staff"}
      description={`Suivi de la réunion ${meeting.weekKey} et décisions staff.`}
      icon={CalendarDays}
    >
      <MeetingDecisionsClient
        meetingId={id}
        meetingStatus={meeting.status}
        canWrite={canWrite}
        canGrave={canGrave}
      />
    </PageShell>
  );
}
