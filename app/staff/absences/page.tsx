import { requireChefOrEtatMajor } from "@/lib/guards";
import AbsencesClient from "./absences-client";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/staff/ui/PageShell";

export default async function StaffAbsencesPage() {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  return (
    <PageShell
      title="Absences"
      description="Gestion des absences membres"
    >
      <AbsencesClient />
    </PageShell>
  );
}
