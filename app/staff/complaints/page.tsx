import { requireChefOrEtatMajor } from "@/lib/guards";
import { redirect } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { PageShell } from "@/components/staff/ui/PageShell";
import ComplaintsClient from "./complaints-client";

export default async function StaffComplaintsPage() {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  return (
    <PageShell
      title="Plaintes"
      description="Suivi des tickets de plainte, filtrage par statut et accès rapide aux dossiers à traiter."
      icon={AlertCircle}
    >
      <ComplaintsClient />
    </PageShell>
  );
}
