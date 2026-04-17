import { requireChefOrEtatMajor } from "@/lib/guards";
import SanctionsClient from "./sanctions-client";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/staff/ui";
import { Ban } from "lucide-react";

export default async function StaffSanctionsPage() {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  return (
    <PageShell
      title="Sanctions"
      description="Pilotage des sanctions staff, création rapide et suivi des statuts Discord associés."
      icon={Ban}
    >
      <SanctionsClient />
    </PageShell>
  );
}
