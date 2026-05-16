/**
 * Tracker global d'appels LYG — fenêtre glissante 15 min.
 *
 * Architecture deux niveaux :
 *  1. Ring buffer en mémoire (globalThis) : reads instantanés, pruning auto.
 *  2. Persistance DB (table LygCall) : survit aux restarts panel.
 *
 * Au boot du process, on hydrate le ring buffer depuis les rows DB <15 min.
 * À chaque recordLygCall, on insère en DB en fire-and-forget (n'attend pas
 * la confirmation, n'échoue jamais bloquant).
 *
 * Cleanup périodique (5 min) supprime les rows >1h pour garder la table
 * légère (~1500 rows max attendus).
 *
 * Reçoit aussi les calls du worker et de Kitty Gang via /api/internal/lyg-track.
 */

import { prisma } from "@/lib/db";

export type Service = "panel" | "worker" | "kitty";

/**
 * Normalise un path LYG en endpoint regroupable :
 *   /warns/76561198123456789?limit=10  →  /warns/:steamId
 *   /banklogs/abc123def456...           →  /banklogs/:id
 *
 * Source de vérité unique pour le tracking — tous les callers LYG doivent
 * passer par cette normalisation pour que `byEndpoint` agrège correctement.
 */
export function normalizeLygEndpoint(path: string): string {
  return path
    .replace(/\/\d{17}/g, "/:steamId")
    .replace(/\/[a-f0-9-]{20,}/gi, "/:id")
    .split("?")[0];
}
type LygCallEvent = { ts: number; ok: boolean; status: number; endpoint: string; service: Service };

const g = globalThis as unknown as {
  __lygCalls?: LygCallEvent[];
  __lygLastRateLimit?: { ts: number; pauseUntil: number; endpoint: string; service: Service } | null;
  __lygBootstrapPromise?: Promise<void> | null;
  __lygCleanupStarted?: boolean;
  __lygProcessBootAt?: number;
};

g.__lygCalls ??= [];
g.__lygLastRateLimit ??= null;
g.__lygBootstrapPromise ??= null;
g.__lygCleanupStarted ??= false;
g.__lygProcessBootAt ??= Date.now();

const WINDOW_MS = 15 * 60 * 1000;
const RETENTION_MS = 60 * 60 * 1000; // 1 h en DB
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

function prune() {
  const cutoff = Date.now() - WINDOW_MS;
  g.__lygCalls = g.__lygCalls!.filter((c) => c.ts >= cutoff);
}

/**
 * Hydrate le ring buffer depuis la DB au premier appel après un boot process.
 *
 * On ne charge que les rows < `processBootAt` pour éviter d'aspirer en double
 * les calls que le process actuel a lui-même inscrits depuis son démarrage
 * (et qui sont déjà dans le ring in-memory).
 */
async function bootstrap(): Promise<void> {
  try {
    const now = Date.now();
    const windowStart = new Date(now - WINDOW_MS);
    const bootTime = new Date(g.__lygProcessBootAt!);

    const rows = await prisma.lygCall.findMany({
      where: {
        createdAt: { gte: windowStart, lt: bootTime },
      },
      select: { service: true, endpoint: true, ok: true, status: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 5000,
    });

    for (const row of rows) {
      g.__lygCalls!.push({
        ts: row.createdAt.getTime(),
        ok: row.ok,
        status: row.status,
        endpoint: row.endpoint,
        service: (row.service as Service) ?? "panel",
      });
    }
  } catch {
    // bootstrap silencieux : si DB indispo, on continue avec ce qu'on a en mémoire
  }
}

function ensureBootstrapped(): Promise<void> {
  if (!g.__lygBootstrapPromise) {
    g.__lygBootstrapPromise = bootstrap();
  }
  return g.__lygBootstrapPromise;
}

/**
 * Cleanup périodique : supprime les rows DB >1h pour garder la table légère.
 * Démarré une seule fois par process.
 */
function ensureCleanupStarted(): void {
  if (g.__lygCleanupStarted) return;
  if (typeof setInterval === "undefined") return;
  g.__lygCleanupStarted = true;

  const handle = setInterval(async () => {
    try {
      await prisma.lygCall.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - RETENTION_MS) } },
      });
    } catch {
      // ignore — cleanup non critique
    }
  }, CLEANUP_INTERVAL_MS);
  // unref pour ne pas tenir le process en vie sur ce timer seul
  handle.unref?.();
}

export function recordLygCall(event: { ok: boolean; status: number; endpoint: string; service?: Service }): void {
  const service = event.service ?? "panel";
  const ts = Date.now();
  g.__lygCalls!.push({ ts, ok: event.ok, status: event.status, endpoint: event.endpoint, service });
  if (event.status === 429) {
    g.__lygLastRateLimit = { ts, pauseUntil: 0, endpoint: event.endpoint, service };
  }
  if (g.__lygCalls!.length > 5000) prune();

  // Persistance DB en fire-and-forget : n'attend pas, n'échoue jamais bloquant.
  void prisma.lygCall
    .create({
      data: {
        service,
        endpoint: event.endpoint,
        ok: event.ok,
        status: event.status,
      },
    })
    .catch(() => {
      // DB indispo / lock / etc → on garde au moins l'état en mémoire
    });

  // Démarre le cleanup périodique au premier call enregistré.
  ensureCleanupStarted();
}

export function setLygPauseUntil(until: number, endpoint: string, service: Service = "panel"): void {
  g.__lygLastRateLimit = { ts: Date.now(), pauseUntil: until, endpoint, service };
}

export async function getLygStats() {
  await ensureBootstrapped();
  prune();
  const calls = g.__lygCalls!;
  const total = calls.length;
  const ok = calls.filter((c) => c.ok).length;
  const errors = total - ok;
  const rateLimited = calls.filter((c) => c.status === 429).length;

  const byEndpoint: Record<string, number> = {};
  for (const c of calls) byEndpoint[c.endpoint] = (byEndpoint[c.endpoint] ?? 0) + 1;

  // Breakdown par service
  const services: Record<Service, { total: number; ok: number; errors: number; rateLimited: number }> = {
    panel: { total: 0, ok: 0, errors: 0, rateLimited: 0 },
    worker: { total: 0, ok: 0, errors: 0, rateLimited: 0 },
    kitty: { total: 0, ok: 0, errors: 0, rateLimited: 0 },
  };
  for (const c of calls) {
    services[c.service].total++;
    if (c.ok) services[c.service].ok++;
    else services[c.service].errors++;
    if (c.status === 429) services[c.service].rateLimited++;
  }

  return {
    windowMinutes: 15,
    total,
    ok,
    errors,
    rateLimited,
    byEndpoint,
    services,
    lastRateLimit: g.__lygLastRateLimit,
    pausedNow: g.__lygLastRateLimit ? Date.now() < g.__lygLastRateLimit.pauseUntil : false,
    pauseRemainingSec: g.__lygLastRateLimit
      ? Math.max(0, Math.ceil((g.__lygLastRateLimit.pauseUntil - Date.now()) / 1000))
      : 0,
  };
}
