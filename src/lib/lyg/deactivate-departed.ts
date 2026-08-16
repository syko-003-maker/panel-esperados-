import { prisma } from "@/lib/db";

/**
 * Désactive automatiquement les membres qui ont quitté la famille LYG.
 *
 * Principe : le poller famille rafraîchit `lastSeenAt` de TOUS les membres du
 * roster (online + offline) toutes les ~5 s. Un membre parti n'est plus dans le
 * roster → son `lastSeenAt` se fige. On compare la fraîcheur au **dernier sync**
 * (max lastSeenAt), PAS à `now()` : si le poller tombe en panne, `maxSeen` est
 * vieux aussi → personne n'est désactivé à tort.
 *
 * On pose seulement `isActive=false` (pas `isGhost`) → **auto-correcteur** : si
 * un membre était désactivé par erreur (roster LYG temporairement incomplet), la
 * sync le remet `isActive=true` dès qu'il réapparaît au roster. Un vrai parti,
 * lui, n'y revient pas → il reste masqué.
 */
export async function deactivateDepartedLygMembers(params: { graceMinutes?: number } = {}): Promise<{
  deactivated: number;
  reason?: string;
  cutoff?: string;
  maxSeen?: string;
}> {
  const graceMinutes = params.graceMinutes && params.graceMinutes > 0 ? params.graceMinutes : 30;

  const agg = await prisma.member.aggregate({ _max: { lastSeenAt: true } });
  const maxSeen = agg._max.lastSeenAt;
  if (!maxSeen) return { deactivated: 0, reason: "no_sync" };

  const cutoff = new Date(maxSeen.getTime() - graceMinutes * 60 * 1000);

  const res = await prisma.member.updateMany({
    where: {
      isActive: true,
      isGhost: false,
      lastSeenAt: { lt: cutoff }, // null exclu (ne satisfait pas `lt`)
    },
    data: {
      isActive: false,
      missingFromLygSince: new Date(),
      // Quitter la famille, c'est perdre le rang famille. `wlClass` est un
      // miroir de LYG : le laisser figé faisait passer un ancien membre pour
      // toujours whitelisté — constaté sur deux fiches, dont une partie le
      // 26/07 qui affichait encore WL 1 mi-août.
      //
      // Sûr par construction : on hérite du garde-fou ci-dessus (comparaison au
      // dernier sync, pas à `now()`), et l'effacement s'auto-corrige — la sync
      // réécrit `wlClass` depuis le snapshot dès que le membre réapparaît.
      wlClass: null,
      wlOwner: false,
      // `wlClassIntent` volontairement épargné : c'est une décision humaine que
      // personne n'a annulée. On la retrouve si la personne revient.
    },
  });

  return { deactivated: res.count, cutoff: cutoff.toISOString(), maxSeen: maxSeen.toISOString() };
}
