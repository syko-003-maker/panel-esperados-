import { requireStaffAccess } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import StaffLinkForm, { type Link } from "./StaffLinkForm";
import { redirect } from "next/navigation";
import { PageShell, SectionCard } from "@/components/staff/ui";
import { Link as LinkIcon, Info, Clock } from "lucide-react";
import NextLink from "next/link";
import { toFamilyCuid } from "@/lib/family";

const DEFAULT_FAMILY_ID = process.env.FAMILY_ID ?? "esperados";

/** Nombre de jours écoulés depuis une date, arrondi au jour plein. */
function daysSince(date: Date): number {
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

/**
 * Une demande devient « oubliée » au-delà de ce seuil. Purement visuel : rien
 * n'expire, rien n'est relancé automatiquement — le seuil sert seulement à
 * faire ressortir les dossiers qui traînent.
 */
const STALE_AFTER_DAYS = 7;

function toPlain(value: unknown): unknown {
  if (value === null) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (
    value !== null &&
    (value as any).constructor?.name === "Decimal" &&
    typeof (value as any).toString === "function"
  ) {
    return (value as any).toString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => toPlain(item));
  }
  if (typeof value === "object" && value !== null) {
    const plain: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      plain[key] = toPlain(entry);
    }
    return plain;
  }
  return value;
}

/**
 * ✅ SECURITY: /staff/link access control
 * ✅ FEATURE: Support ?discordId= query param (from link-request workflow)
 * 
 * Only staff with canAccessStaffPanel=true can access this page (read + write)
 */
export default async function StaffLinkPage(props: {
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  // ✅ RBAC: Require basic staff access (any user with canAccessStaffPanel=true)
  const guard = await requireStaffAccess();
  if (guard instanceof Response) {
    redirect("/staff/forbidden");
  }

  // Get current user's discord ID (from guard data)
  const currentUserDiscordId = (guard as any)?.session?.discordId;

  // Demandes de liaison encore ouvertes. Jusqu'ici elles n'existaient que sous
  // forme d'un message Discord posté à la création : une fois ce message
  // descendu dans le salon, plus rien ne les rappelait. Aucun mécanisme
  // d'expiration ni de relance n'a jamais existé — d'où 4 demandes en attente
  // de 27 à 143 jours au moment de l'ajout de ce bloc.
  //
  // Affichage seul, volontairement : aucune action, aucun message envoyé. Le
  // traitement reste manuel via le formulaire ci-dessous, que chaque ligne
  // pré-remplit grâce au paramètre ?discordId= qu'il accepte déjà.
  const pendingRequests = await prisma.linkRequest.findMany({
    where: { familyId: await toFamilyCuid(DEFAULT_FAMILY_ID), status: "PENDING" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      requesterDiscordId: true,
      requesterName: true,
      steamId: true,
      createdAt: true,
    },
  });

  // `DEFAULT_FAMILY_ID` est un slug ; les 235 membres portent le CUID de la
  // famille. Le filtre brut ne remontait donc rien et la liste des liens
  // existants restait vide en permanence — page fonctionnelle en apparence,
  // aveugle en réalité. Seul l'affichage était concerné : la création de lien
  // passe par /api/staff/link et n'a jamais dépendu de cette requête.
  const links = await prisma.member.findMany({
    where: { familyId: await toFamilyCuid(DEFAULT_FAMILY_ID) },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      discordId: true,
      steamId: true,
      rpName: true,
      grade: true,
      gradeLevel: true,
      roleDiscordId: true,
      isActive: true,
      joinedAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const initialLinks = links.map((link) => toPlain(link)) as Link[];

  // ✅ Support ?discordId= query param from link-request workflow
  const discordIdParam = props.searchParams?.discordId 
    ? String(props.searchParams.discordId)
    : undefined;

  return (
    <PageShell
      title="Liaison Membre"
      description="Lier un compte Discord à Steam pour accéder au panel staff"
      icon={LinkIcon}
    >
      <div className="grid gap-6 max-w-4xl mx-auto">
        {/* Demandes en attente — affichage seul, aucune action automatique */}
        {pendingRequests.length > 0 && (
          <SectionCard
            title={`Demandes en attente (${pendingRequests.length})`}
            description="Cliquez sur une demande pour pré-remplir le formulaire ci-dessous."
            icon={Clock}
          >
            <ul className="space-y-2">
              {pendingRequests.map((request) => {
                const age = daysSince(request.createdAt);
                const isStale = age >= STALE_AFTER_DAYS;
                return (
                  <li key={request.id}>
                    <NextLink
                      href={`/staff/link?discordId=${encodeURIComponent(request.requesterDiscordId)}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800/80 bg-slate-900/40 px-3 py-2 transition-colors hover:border-slate-700 hover:bg-slate-900/70"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-foreground">
                          {request.requesterName || "Nom inconnu"}
                        </span>
                        <span className="block truncate font-mono text-xs text-muted-foreground">
                          Discord {request.requesterDiscordId}
                          {request.steamId ? ` · Steam ${request.steamId}` : " · aucun SteamID fourni"}
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                          isStale
                            ? "bg-amber-500/15 text-amber-300"
                            : "bg-slate-700/40 text-muted-foreground"
                        }`}
                      >
                        {age === 0 ? "aujourd'hui" : `${age} j`}
                      </span>
                    </NextLink>
                  </li>
                );
              })}
            </ul>
          </SectionCard>
        )}

        {/* Guide */}
        <SectionCard title="Guide de liaison" icon={Info}>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">Étape 1 :</strong> Le membre envoie une demande de liaison via <code className="text-xs bg-slate-900/60 px-1.5 py-0.5 rounded">/link-request</code> sur Discord
            </p>
            <p>
              <strong className="text-foreground">Étape 2 :</strong> Vérifiez l&apos;identité du membre (Discord ID + SteamID64)
            </p>
            <p>
              <strong className="text-foreground">Étape 3 :</strong> Remplissez le formulaire ci-dessous avec le Discord ID, SteamID64 et Nom RP
            </p>
            <p>
              <strong className="text-foreground">Étape 4 :</strong> Une fois lié, le membre peut se connecter au panel avec son compte Discord
            </p>
          </div>
        </SectionCard>

        {/* Form */}
        <SectionCard title="Nouveau lien">
          <StaffLinkForm 
            initialLinks={initialLinks}
            prefilledDiscordId={discordIdParam}
            currentUserDiscordId={currentUserDiscordId}
          />
        </SectionCard>
      </div>
    </PageShell>
  );
}
