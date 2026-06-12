import { requireFullWriter } from "@/lib/guards";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/staff/ui";
import { ClipboardList } from "lucide-react";
import RecruitmentModelsClient from "./models-client";

export default async function RecruitmentModelsPage() {
  // Création/édition des questionnaires d'entretien : EM + Chefs.
  const guard = await requireFullWriter();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  return (
    <PageShell
      title="Modèles de recrutement"
      description="Crée plusieurs questionnaires d'entretien — au lancement d'un test, le recruteur choisit lequel utiliser."
      icon={ClipboardList}
    >
      <RecruitmentModelsClient />
    </PageShell>
  );
}
