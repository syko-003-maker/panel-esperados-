import "server-only";
import { fetchFamilyPlaytimes7d } from "@/lib/lyg/fetchFamilyPlaytimes7d";
import { setLygPauseUntil } from "@/lib/lyg-stats";

/**
 * Loop "in-family" : poll régulier de l'endpoint LYG playtimes avec une
 * fenêtre courte pour savoir QUI est actuellement en métier famille.
 *
 * Pourquoi : l'endpoint /api/players/:steamid renvoie `connected:true` dès
 * qu'un joueur est sur le serveur, MÊME s'il joue dans une autre famille ou
 * en citoyen. On voulait n'afficher "en ligne" QUE quand le membre est
 * effectivement en métier famille. La seule façon est de regarder son
 * playtime FAMILLE sur une fenêtre récente : si playtime > 0 dans les N
 * dernières minutes → il est en métier famille pendant cette fenêtre.
 *
 * Avantage budget : 1 seul POST renvoie l'info pour TOUTE la famille,
 * remplace les ~22 calls/cycle de l'ancien per-player loop.
 */

const POLL_INTERVAL_MS = 30_000;   // 1 poll toutes les 30s (30 calls/15min)
const WINDOW_MINUTES   = 4;        // fenêtre LYG : playtime des 4 dernières min
// Maths du système :
//   L'API LYG renvoie le CUMUL de playtime dans la fenêtre (arrondi à la min
//   entière). Donc un joueur qui s'arrête met `WINDOW_MINUTES` min à sortir
//   de la réponse (le cumul ne descend à 0 qu'une fois sa playtime sortie
//   complètement de la fenêtre). Plus la fenêtre est courte, plus la
//   disparition est rapide ; plus elle est large, plus on tolère les
//   micro-pauses (switch citoyen 30s, etc.).
//
//   Avec WINDOW=4, POLL=30s :
//     - Joueur qui rejoint : visible dès qu'il a 1 min cumulée (~30-90s)
//     - Joueur qui s'arrête : disparaît du cache LYG après ~4 min
//     - + STALE_AFTER_MS_NORMAL (5 min) = total ~5 min max après arrêt
//
//   Trade-off : plus rapide à détecter online, légèrement plus tolérant aux
//   pauses, coût LYG x2 (30/15min vs 15/15min, budget largement OK).
const STALE_AFTER_MS_NORMAL = 5 * 60 * 1000;  // 5 min en fonctionnement normal
const STALE_AFTER_MS_PAUSED = 20 * 60 * 1000; // 20 min pendant un 429 pour
// ne pas vider l'UI pendant le backoff (le pause LYG peut durer jusqu'à 15 min).

const DEFAULT_RATE_LIMIT_PAUSE_MS = 60_000;

type InFamilyEntry = {
  /** Dernière fois où on a vu playtime > 0 dans la fenêtre courte */
  lastActiveAt: number;
  /** Last known last_name (utile pour l'UI, snapshot de l'API players) */
  last_name: string | null;
};

const g = globalThis as unknown as {
  __inFamilyCache?: Map<string, InFamilyEntry>;
  __inFamilyLoopStarted?: boolean;
  __inFamilyPausedUntil?: number;
};
g.__inFamilyCache ??= new Map();

export const inFamilyCache = g.__inFamilyCache!;

/**
 * Stale dynamique : si on est en pause 429 LYG, on garde le cache plus
 * longtemps pour ne pas vider l'UI pendant le backoff. Sinon stale court
 * pour qu'un joueur qui s'arrête disparaisse rapidement.
 */
function currentStaleAfterMs(): number {
  if (g.__inFamilyPausedUntil && Date.now() < g.__inFamilyPausedUntil) {
    return STALE_AFTER_MS_PAUSED;
  }
  return STALE_AFTER_MS_NORMAL;
}

/**
 * Retourne true si le membre est considéré actif en métier famille.
 */
export function isInFamily(steamId: string): boolean {
  const entry = inFamilyCache.get(steamId);
  if (!entry) return false;
  return Date.now() - entry.lastActiveAt < currentStaleAfterMs();
}

/**
 * Pour l'API d'export : renvoie le statut + métadonnée light.
 */
export function getInFamilyStatus(steamId: string): {
  inFamily: boolean;
  last_name: string | null;
  updatedAt: number | null;
} {
  const entry = inFamilyCache.get(steamId);
  if (!entry) return { inFamily: false, last_name: null, updatedAt: null };
  return {
    inFamily: Date.now() - entry.lastActiveAt < currentStaleAfterMs(),
    last_name: entry.last_name,
    updatedAt: entry.lastActiveAt,
  };
}

async function pollOnce(): Promise<void> {
  const token = (process.env.LYG_TOKEN ?? "").trim();
  if (!token) {
    console.warn("[in-family] LYG_TOKEN missing — skip poll");
    return;
  }

  try {
    const rows = await fetchFamilyPlaytimes7d(token, { timeMinutes: WINDOW_MINUTES });
    const now = Date.now();
    let activeCount = 0;
    for (const row of rows) {
      if (row.playtime7d > 0) {
        // playtime > 0 dans la fenêtre = membre vu en métier famille
        const existing = inFamilyCache.get(row.steamId);
        inFamilyCache.set(row.steamId, {
          lastActiveAt: now,
          last_name: existing?.last_name ?? null,
        });
        activeCount++;
      }
    }
    // Log compact : juste le compteur, suffisant pour confirmer que le
    // loop tourne et donner une idée du nombre d'actifs en métier famille.
    console.log(`[in-family] poll ok rows=${rows.length} active=${activeCount}`);
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    // 429 → pause temporaire (extracted from message if present)
    if (/429|rate.?limit/i.test(msg)) {
      const m = msg.match(/(\d+)\s*minute/i);
      const pauseMs = m ? Number(m[1]) * 60_000 : DEFAULT_RATE_LIMIT_PAUSE_MS;
      g.__inFamilyPausedUntil = Date.now() + pauseMs;
      setLygPauseUntil(g.__inFamilyPausedUntil, "/darkrp/familles/playtimes");
      console.warn(`[in-family] 429 from LYG, pausing for ${pauseMs}ms`);
      return;
    }
    console.error("[in-family] poll error:", msg);
  }
}

async function loop(): Promise<void> {
  while (true) {
    try {
      if (g.__inFamilyPausedUntil && Date.now() < g.__inFamilyPausedUntil) {
        const remaining = g.__inFamilyPausedUntil - Date.now();
        await new Promise((r) => setTimeout(r, Math.min(remaining, 5_000)));
        continue;
      }
      await pollOnce();
    } catch (err) {
      console.error("[in-family] loop iteration error:", err);
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

export function ensureInFamilyLoopStarted(): void {
  if (g.__inFamilyLoopStarted) return;
  g.__inFamilyLoopStarted = true;
  console.log("[in-family] background loop starting (window=" + WINDOW_MINUTES + "min, poll=" + (POLL_INTERVAL_MS / 1000) + "s)");
  loop().catch((e) => {
    console.error("[in-family] loop crashed", e);
    g.__inFamilyLoopStarted = false;
  });
}
