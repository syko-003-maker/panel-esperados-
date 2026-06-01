import { requireFullWriter } from "@/lib/guards";
import { isCurrentSessionFullWriter, isCurrentSessionChefFamille } from "@/lib/rbac";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/staff/ui";
import { Users } from "lucide-react";
import FamilyClient from "./family-client";
import { getLygCredentialState } from "@/lib/lyg/family-admin";
import { auth } from "@/auth";

export default async function StaffFamilyPage() {
  // Famille WL = données sensibles + actions LYG en temps réel.
  // Restreint à Chef famille + Sous-Chef famille + EM. Exclut Encadrant.
  const guard = await requireFullWriter();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  // canWrite       : Chef/Sous-Chef/EM peuvent toucher la page.
  // canManageRanks : seuls Chef + Sous-Chef peuvent up/down. L'EM ne voit
  //                  que les boutons Add/Remove (failsafe).
  const canWrite = await isCurrentSessionFullWriter();
  const canManageRanks = await isCurrentSessionChefFamille();

  // État du cookie LYG → "mode live" si un cookie valide est configuré ET que
  // le caller est autorisé à l'utiliser : soit son propriétaire, soit la
  // direction famille (Chef + Sous-Chef = canManageRanks). Le Sous-Chef peut
  // donc agir en live via le cookie partagé du Chef.
  const cookieState = await getLygCredentialState();
  const session = await auth();
  const callerDiscordId =
    (session as any)?.discordId ?? (session as any)?.user?.discordId ?? null;
  const liveMode =
    cookieState.configured &&
    !cookieState.expired &&
    (cookieState.ownerDiscordId === callerDiscordId || canManageRanks);

  return (
    <PageShell
      title="Famille WL"
      description={
        liveMode
          ? "Mode live : les changements sont appliqués en temps réel sur families.lyg.fr via ton cookie."
          : "Mode planification : les changements sont stockés ici, à reporter manuellement sur families.lyg.fr (ou configure ton cookie LYG dans Paramètres pour passer en mode live)."
      }
      icon={Users}
    >
      <FamilyClient
        canWrite={canWrite}
        canManageRanks={canManageRanks}
        liveMode={liveMode}
        cookieState={{
          configured: cookieState.configured,
          expired: cookieState.expired,
          ownerDiscordId: cookieState.ownerDiscordId,
          ownerName: cookieState.ownerName,
        }}
      />
    </PageShell>
  );
}
