import { requireEncadrantOrAbove } from "@/lib/guards";
import MeetingsClient from "./meetings-client";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/staff/ui/PageShell";
import { Calendar } from "lucide-react";

export default async function StaffMeetingsPage() {
  // ✅ PATCH: Unified staff protection (session + isStaff + member linked)
  const guard = await requireEncadrantOrAbove();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  return (
    <PageShell
      title="Réunions staff"
      description="Créez, suivez et ouvrez rapidement les réunions de la famille."
      icon={Calendar}
    >
      <MeetingsClient />
    </PageShell>
  );
}
