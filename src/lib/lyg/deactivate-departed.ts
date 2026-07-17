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
    },
  });

  return { deactivated: res.count, cutoff: cutoff.toISOString(), maxSeen: maxSeen.toISOString() };
}
