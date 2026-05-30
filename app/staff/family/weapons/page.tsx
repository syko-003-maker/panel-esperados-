import { requireFullWriter } from "@/lib/guards";
import { isCurrentSessionChefFamille } from "@/lib/rbac";
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageShell } from "@/components/staff/ui";
import { Swords, ArrowLeft } from "lucide-react";
import WeaponsClient from "./weapons-client";
import { getLygCredentialState } from "@/lib/lyg/family-admin";
import { auth } from "@/auth";

export default async function StaffFamilyWeaponsPage() {
  // Gestion des armes par classe WL = action LYG temps réel sensible.
  // Lecture : Chef/Sous-Chef/EM. Écriture : Chef + Sous-Chef + propriétaire cookie.
  const guard = await requireFullWriter();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  const canManage = await isCurrentSessionChefFamille();

  const cookieState = await getLygCredentialState();
  const session = await auth();
  const callerDiscordId =
    (session as any)?.discordId ?? (session as any)?.user?.discordId ?? null;
  const liveMode =
    cookieState.configured &&
    !cookieState.expired &&
    cookieState.ownerDiscordId === callerDiscordId;

  return (
    <PageShell
      title="Armes par classe WL"
      description="Gère l'arsenal de chaque classe WL (Métier n°1 à 4) sur families.lyg.fr. Chaque arme coûte des points ; chaque classe a un budget à ne pas dépasser."
      icon={Swords}
      actions={
        <Link
          href="/staff/family"
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08]"
        >
          <ArrowLeft className="h-4 w-4" />
          Famille WL
        </Link>
      }
    >
      <WeaponsClient
        canManage={canManage}
        liveMode={liveMode}
        cookieState={{
          configured: cookieState.configured,
          expired: cookieState.expired,
          ownerName: cookieState.ownerName,
        }}
      />
    </PageShell>
  );
}
