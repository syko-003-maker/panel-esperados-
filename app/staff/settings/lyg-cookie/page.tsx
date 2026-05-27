import { requireChefFamille } from "@/lib/guards";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/staff/ui";
import { KeyRound } from "lucide-react";
import LygCookieClient from "./lyg-cookie-client";
import { getLygCredentialState } from "@/lib/lyg/family-admin";

export default async function StaffLygCookiePage() {
  // Cookie admin LYG = ressource ULTRA-sensible (donne accès complet en
  // écriture à families.lyg.fr). Réservé Chef famille + Sous-Chef famille.
  // Pas même l'EM ne devrait y toucher.
  const guard = await requireChefFamille();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  const state = await getLygCredentialState();

  return (
    <PageShell
      title="Cookie LYG admin"
      description="Permet au panel d'effectuer les actions famille en temps réel via families.lyg.fr (sans avoir à passer manuellement sur le site admin)."
      icon={KeyRound}
    >
      <LygCookieClient initialState={state} />
    </PageShell>
  );
}
