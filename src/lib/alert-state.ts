/**
 * État persistant des alertes techniques.
 *
 * `sendDiscordAlert()` déduplique en mémoire, 1 alerte/minute/clé. C'est
 * insuffisant pour un watchdog qui tourne toutes les 5 minutes : chaque
 * exécution repasserait le seuil, et une panne d'une nuit produirait des
 * dizaines de messages identiques. Le `Map` est en plus perdu à chaque
 * redémarrage du panel, ce qui relancerait les alertes d'une panne en cours.
 *
 * On s'appuie donc sur la table `AlertEvent` (champ `resolvedAt`) :
 *
 *   panne détectée, aucune alerte ouverte  → on notifie + on ouvre
 *   panne détectée, alerte déjà ouverte    → silence
 *   retour à la normale, alerte ouverte    → on notifie + on ferme
 *   tout va bien, aucune alerte ouverte    → silence
 *
 * Résultat : exactement deux messages par incident, quelle que soit sa durée.
 */

import { prisma } from "@/lib/db";
import { toFamilyCuid } from "@/lib/family";

/** Alerte ouverte (non résolue) pour ce type, ou null. */
export async function getOpenAlert(type: string) {
  return prisma.alertEvent.findFirst({
    where: { type, resolvedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Ouvre une alerte si aucune n'est déjà ouverte pour ce type.
 * Renvoie true si c'est une NOUVELLE panne (donc s'il faut notifier).
 */
export async function openAlertIfNew(params: {
  type: string;
  severity: "info" | "warning" | "critical";
  message: string;
  meta?: Record<string, unknown>;
}): Promise<boolean> {
  const existing = await getOpenAlert(params.type);
  if (existing) return false;

  await prisma.alertEvent.create({
    data: {
      familyId: await toFamilyCuid("esperados"),
      type: params.type,
      severity: params.severity,
      message: params.message,
      meta: (params.meta ?? {}) as any,
    },
  });
  return true;
}

/**
 * Ferme l'alerte ouverte pour ce type, s'il y en a une.
 * Renvoie la durée de la panne en secondes si une alerte a été fermée,
 * null s'il n'y avait rien d'ouvert (donc rien à annoncer).
 */
export async function resolveAlertIfOpen(type: string): Promise<number | null> {
  const existing = await getOpenAlert(type);
  if (!existing) return null;

  const now = new Date();
  await prisma.alertEvent.update({
    where: { id: existing.id },
    data: { resolvedAt: now },
  });
  return Math.round((now.getTime() - existing.createdAt.getTime()) / 1000);
}

/** Formate une durée en secondes pour un humain : "3 min 20 s", "2 h 5 min". */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h} h ${m} min`;
}
