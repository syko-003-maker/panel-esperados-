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

const POLL_INTERVAL_MS = 5_000;    // 1 poll toutes les 5s (180 calls/15min ; quota LYG = 300/15min)
const WINDOW_MINUTES   = 2;        // fenêtre LYG : playtime des 2 dernières min (réactif)
// Maths du système (délai « fantôme » = fenêtre + garde de fraîcheur) :
//   L'API LYG renvoie le CUMUL de playtime dans la fenêtre (arrondi à la min
//   entière). Un joueur qui s'arrête met `WINDOW_MINUTES` min à sortir de la
//   réponse (le cumul ne tombe à 0 qu'une fois sa playtime sortie de la
//   fenêtre), PUIS il reste affiché encore `STALE_AFTER_MS_NORMAL`.
//   → délai réel avant de passer "hors ligne" = WINDOW + STALE.
//
//   La garde ne sert qu'à survivre à des polls manqués (poll=5s) — pas à
//   tolérer les pauses (c'est le rôle de la fenêtre). Courte pour que les
//   joueurs partis disparaissent vite (bug remonté : joueurs affichés en
//   ligne alors qu'ils étaient partis).
//
//   Avec WINDOW=2, STALE=45s, POLL=5s (réglage temps réel, quota 300/15min) :
//     - Joueur qui rejoint : visible en ~30-60s (dès ~1 min cumulée)
//     - Joueur qui s'arrête : hors ligne après ~2 min + 45s ≈ 2,75 min
//     - STALE=45s tolère ~9 polls manqués (5s) → pas de clignotement
const STALE_AFTER_MS_NORMAL = 45 * 1000;      // 45s (survit à ~9 polls manqués à 5s)
const STALE_AFTER_MS_PAUSED = 4 * 60 * 1000;  // 4 min pendant un 429 : couvre un
// backoff court sans laisser un joueur parti affiché "en métier" trop longtemps.

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
  __inFamilyWarm?: boolean;
};
g.__inFamilyCache ??= new Map();

export const inFamilyCache = g.__inFamilyCache!;

/**
 * true dès qu'un premier poll a réussi. Avant ça, le cache est vide (redémarrage
 * panel) → on ne sait rien : l'API renvoie un état "inconnu" pour que l'UI
 * affiche "…" plutôt qu'un faux "hors ligne" pour tout le monde au boot.
 */
export function isInFamilyWarm(): boolean {
  return Boolean(g.__inFamilyWarm);
}

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
    // Poll réussi → on a une vue à jour : le cache est "warm".
    g.__inFamilyWarm = true;
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
