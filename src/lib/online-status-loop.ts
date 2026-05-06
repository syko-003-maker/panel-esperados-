import "server-only";
import { fetchLygPlayer } from "@/lib/lyg-client";
import { prisma } from "@/lib/db";
import { setLygPauseUntil } from "@/lib/lyg-stats";

/**
 * Loop singleton pour rafraîchir les statuts online LYG en continu.
 * Démarré lazy au premier appel à ensureOnlineStatusLoopStarted().
 *
 * Cache partagé via globalThis pour être accessible depuis n'importe quelle route.
 */

export type CachedStatus = { connected: boolean; last_name: string | null; coins: number | null; updatedAt: number };

const g = globalThis as unknown as {
  __onlineStatusCache?: Map<string, CachedStatus>;
  __onlineStatusLoopStarted?: boolean;
  __onlineStatusPausedUntil?: number;
};
g.__onlineStatusCache ??= new Map();

export const onlineStatusCache = g.__onlineStatusCache!;

// Budget LYG = 100 req/15min PARTAGÉ avec Kitty Gang.
// 30s entre appels = 2 calls/min = ~30 calls/15min.
const CALL_SPACING_MS = 30_000;
const CYCLE_REST_MS = 60_000;
const DEFAULT_RATE_LIMIT_PAUSE_MS = 60_000;

async function getActiveSteamIds(): Promise<string[]> {
  try {
    const members = await prisma.member.findMany({
      where: { isActive: true, gradeLevel: { gt: 0 }, steamId: { not: null } },
      select: { steamId: true },
    });
    return members.map((m) => m.steamId!).filter((s) => /^\d{17}$/.test(s));
  } catch {
    return [];
  }
}

async function refreshOne(steamId: string): Promise<void> {
  try {
    const res = await fetchLygPlayer(steamId);
    if (res.status === 429) {
      const retryAfterHeader = (res.headers as any)?.["retry-after"];
      let pauseMs = DEFAULT_RATE_LIMIT_PAUSE_MS;
      if (retryAfterHeader) {
        const n = Number(retryAfterHeader);
        if (!isNaN(n)) pauseMs = n * 1000;
        else if (/(\d+)\s*minute/i.test(String(retryAfterHeader))) {
          const m = String(retryAfterHeader).match(/(\d+)\s*minute/i);
          if (m) pauseMs = Number(m[1]) * 60_000;
        }
      } else if (res.text && /(\d+)\s*minute/i.test(res.text)) {
        const m = res.text.match(/(\d+)\s*minute/i);
        if (m) pauseMs = Number(m[1]) * 60_000;
      }
      g.__onlineStatusPausedUntil = Date.now() + pauseMs;
      setLygPauseUntil(g.__onlineStatusPausedUntil, "/api/players/:steamId");
      console.warn(`[online-status] 429 from LYG, pausing loop for ${pauseMs}ms`);
      return;
    }

    if (res.ok && res.data) {
      onlineStatusCache.set(steamId, {
        connected: Boolean(res.data.connected),
        last_name: res.data.last_name ?? null,
        coins: res.data.coins ?? null,
        updatedAt: Date.now(),
      });
    } else {
      const existing = onlineStatusCache.get(steamId);
      if (!existing || Date.now() - existing.updatedAt > 10 * 60_000) {
        onlineStatusCache.set(steamId, { connected: false, last_name: null, coins: null, updatedAt: Date.now() });
      }
    }
  } catch {
    // ignore
  }
}

async function loop() {
  while (true) {
    try {
      if (g.__onlineStatusPausedUntil && Date.now() < g.__onlineStatusPausedUntil) {
        const remaining = g.__onlineStatusPausedUntil - Date.now();
        await new Promise((r) => setTimeout(r, Math.min(remaining, 5_000)));
        continue;
      }

      const steamIds = await getActiveSteamIds();
      if (steamIds.length === 0) {
        await new Promise((r) => setTimeout(r, 30_000));
        continue;
      }

      for (const steamId of steamIds) {
        if (g.__onlineStatusPausedUntil && Date.now() < g.__onlineStatusPausedUntil) break;
        await refreshOne(steamId);
        await new Promise((r) => setTimeout(r, CALL_SPACING_MS));
      }

      await new Promise((r) => setTimeout(r, CYCLE_REST_MS));
    } catch (e) {
      console.error("[online-status] loop error", e);
      await new Promise((r) => setTimeout(r, 30_000));
    }
  }
}

export function ensureOnlineStatusLoopStarted() {
  if (g.__onlineStatusLoopStarted) return;
  g.__onlineStatusLoopStarted = true;
  console.log("[online-status] background loop starting");
  loop().catch((e) => {
    console.error("[online-status] loop crashed", e);
    g.__onlineStatusLoopStarted = false;
  });
}
