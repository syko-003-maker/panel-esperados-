import { requireEncadrantOrAbove } from "@/lib/guards";
import { isCurrentSessionFullWriter, isCurrentSessionEncadrantOrAbove } from "@/lib/rbac";
import SanctionsClient from "./sanctions-client";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/staff/ui";
import { Ban } from "lucide-react";

export default async function StaffSanctionsPage() {
  const guard = await requireEncadrantOrAbove();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  // canWrite  : Encadrant + EM + Chefs → voient le formulaire de sanction.
  // canGrave  : EM + Chefs seulement → seuls eux voient Démote / Blacklist.
  const canWrite = await isCurrentSessionEncadrantOrAbove();
  const canGrave = await isCurrentSessionFullWriter();

  return (
    <PageShell
      title="Sanctions"
      description="Pilotage des sanctions staff, création rapide et suivi des statuts Discord associés."
      icon={Ban}
    >
      <SanctionsClient canWrite={canWrite} canGrave={canGrave} />
    </PageShell>
  );
}
