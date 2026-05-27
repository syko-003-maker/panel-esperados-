import { requireChefOrEtatMajor } from "@/lib/guards";
import { isCurrentSessionFullWriter } from "@/lib/rbac";
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

  const canWrite = await isCurrentSessionFullWriter();

  return (
    <PageShell
      title="Sanctions"
      description="Pilotage des sanctions staff, création rapide et suivi des statuts Discord associés."
      icon={Ban}
    >
      <SanctionsClient canWrite={canWrite} />
    </PageShell>
  );
}
