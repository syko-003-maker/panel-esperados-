import { requireChefFamille } from "@/lib/guards";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/staff/ui";
import { ShieldCheck } from "lucide-react";
import AccessClient from "./access-client";

export default async function StaffAccessSettingsPage() {
  // Gestion des autorisations = pouvoir donner/retirer les rôles d'accès au
  // panel. Réservé Chef famille + Sous-Chef famille (comme le cookie LYG).
  const guard = await requireChefFamille();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  return (
    <PageShell
      title="Autorisations"
      description="Gère qui a accès à quoi sur le panel — les rôles d'accès Discord (État-Major, Encadrant, Recruteur) sont appliqués directement depuis ici."
      icon={ShieldCheck}
    >
      <AccessClient />
    </PageShell>
  );
}
