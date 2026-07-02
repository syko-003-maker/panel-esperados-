/**
 * Bus de notifications en mémoire, indexé par discordId.
 *
 * Sert de pont pour les notifications natives de l'appli desktop (Electron) :
 * le web push ne fonctionne pas dans Electron (pas de clés FCM embarquées),
 * donc l'appli sonde /api/me/notifications/recent et affiche des notifs
 * natives. Éphémère (TTL court) : ce qui est manqué appli fermée est de toute
 * façon couvert par le DM Discord (doublure). Aucun stockage en base.
 *
 * Process unique (le service panel) → une Map de module suffit.
 */

type BusItem = { id: string; ts: number; title: string; body: string; url?: string; tag?: string };

const MAX_PER_USER = 40;
const TTL_MS = 5 * 60_000;
const store = new Map<string, BusItem[]>();
let seq = 0;

export function publishNotification(
  discordIds: string[],
  payload: { title: string; body: string; url?: string; tag?: string }
): void {
  const ts = Date.now();
  for (const id of discordIds) {
    if (!id) continue;
    const arr = store.get(id) ?? [];
    arr.push({ id: `${ts}-${++seq}`, ts, ...payload });
    // Purge du vieux + plafond par utilisateur.
    store.set(
      id,
      arr.filter((x) => ts - x.ts < TTL_MS).slice(-MAX_PER_USER)
    );
  }
}

/** Notifs plus récentes que `sinceTs` (ms epoch) et non expirées. */
export function recentNotifications(discordId: string, sinceTs: number): BusItem[] {
  const now = Date.now();
  return (store.get(discordId) ?? []).filter((x) => now - x.ts < TTL_MS && x.ts > sinceTs);
}
