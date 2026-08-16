import { NextResponse } from "next/server";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { GRADE_ROLE_IDS_ORDERED, EXTRA_MEMBER_ROLE_IDS } from "@/lib/grade-colors";
import { isLygWarnActive } from "@/lib/lyg/warn-validity";

export async function GET() {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const DEMOTE_ROLE_ID     = "1340837563753304075";
  const BLACKLIST_ROLE_ID  = "1338901141873758288";
  const RESERVIST_ROLE_ID  = "1312845999366209682";

  // Liste des grades "actifs" éligibles à warns : tous les grades Famille
  // sauf Réserviste (déjà exclu plus bas via NOT).
  // Les rôles "membre basique" (Nutella, etc. = EXTRA_MEMBER_ROLE_IDS) ne sont
  // PAS inclus : ces membres ne sont pas soumis aux règles de warns/sanctions.
  // (Nutella est aussi listé dans GRADE_ROLE_IDS_ORDERED pour s'AFFICHER comme
  // grade → on l'exclut explicitement ici, sinon un membre purement Nutella
  // avec un warn réapparaîtrait dans le récap.)
  // On filtre sur discordRoleIds plutôt que sur Member.gradeLevel car ce
  // dernier est rarement re-syncé après un changement de rôle Discord
  // (ex : retrait du DEMOTE → gradeLevel reste à 0 même si le membre a
  // récupéré son rôle Novato). discordRoleIds est la source de vérité,
  // mise à jour par le worker Discord.
  const ACTIVE_GRADE_ROLE_IDS = GRADE_ROLE_IDS_ORDERED.filter(
    (rid) => rid !== RESERVIST_ROLE_ID && !EXTRA_MEMBER_ROLE_IDS.includes(rid)
  );

  // Membres actifs avec warns, avec au moins un rôle de grade Famille,
  // en excluant démotés, blacklistés et réservistes.
  const members = await prisma.member.findMany({
    where: {
      isActive: true,
      lygWarns: { some: {} },
      discordRoleIds: { hasSome: [...ACTIVE_GRADE_ROLE_IDS] },
      NOT: [
        { discordRoleIds: { has: DEMOTE_ROLE_ID    } },
        { discordRoleIds: { has: BLACKLIST_ROLE_ID } },
        { discordRoleIds: { has: RESERVIST_ROLE_ID } },
      ],
    },
    select: {
      id: true,
      discordId: true,
      rpName: true,
      grade: true,
      steamId: true,
      lygWarns: {
        orderBy: { warnDate: "desc" },
        take: 10,
        select: {
          id: true,
          reason: true,
          type: true,
          warnDate: true,
          expired: true,
          notified: true,
          seenAt: true,
        },
      },
    },
  });

  // Un seul « maintenant » pour tout le lot : sinon deux membres peuvent être
  // évalués de part et d'autre de la date-limite au sein d'une même réponse.
  const now = new Date();

  const data = members
    .map((m) => {
      const warns = m.lygWarns;
      // `expired` seul ne suffit pas : il n'est rafraîchi que pour les membres
      // que le poller interroge. Voir isLygWarnActive().
      const activeWarns = warns.filter((w) => isLygWarnActive(w, now)).length;
      const last = warns[0] ?? null;
      return {
        memberId: m.id,
        discordId: m.discordId,
        rpName: m.rpName,
        grade: m.grade,
        steamId: m.steamId,
        totalWarns: warns.length,
        activeWarns,
        lastWarnDate: last?.warnDate?.toISOString() ?? null,
        lastWarnReason: last?.reason ?? null,
        lastWarnType: last?.type ?? null,
        recentWarns: warns.map((w) => ({
          reason: w.reason,
          type: w.type,
          date: w.warnDate.toISOString(),
          // Le badge de l'UI doit dire la même chose que le compteur.
          expired: !isLygWarnActive(w, now),
        })),
      };
    })
    .sort((a, b) => {
      if (!a.lastWarnDate) return 1;
      if (!b.lastWarnDate) return -1;
      return new Date(b.lastWarnDate).getTime() - new Date(a.lastWarnDate).getTime();
    });

  return NextResponse.json({ ok: true, data });
}
