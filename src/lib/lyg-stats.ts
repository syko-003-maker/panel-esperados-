/**
 * Tracker global d'appels LYG — fenêtre glissante 15 min.
 * Singleton process-wide via globalThis.
 *
 * Reçoit aussi les calls du worker et de Kitty Gang via /api/internal/lyg-track.
 */

export type Service = "panel" | "worker" | "kitty";
type LygCallEvent = { ts: number; ok: boolean; status: number; endpoint: string; service: Service };

const g = globalThis as unknown as {
  __lygCalls?: LygCallEvent[];
  __lygLastRateLimit?: { ts: number; pauseUntil: number; endpoint: string; service: Service } | null;
};

g.__lygCalls ??= [];
g.__lygLastRateLimit ??= null;

const WINDOW_MS = 15 * 60 * 1000;

function prune() {
  const cutoff = Date.now() - WINDOW_MS;
  g.__lygCalls = g.__lygCalls!.filter((c) => c.ts >= cutoff);
}

export function recordLygCall(event: { ok: boolean; status: number; endpoint: string; service?: Service }): void {
  const service = event.service ?? "panel";
  g.__lygCalls!.push({ ts: Date.now(), ok: event.ok, status: event.status, endpoint: event.endpoint, service });
  if (event.status === 429) {
    g.__lygLastRateLimit = { ts: Date.now(), pauseUntil: 0, endpoint: event.endpoint, service };
  }
  if (g.__lygCalls!.length > 5000) prune();
}

export function setLygPauseUntil(until: number, endpoint: string, service: Service = "panel"): void {
  g.__lygLastRateLimit = { ts: Date.now(), pauseUntil: until, endpoint, service };
}

export function getLygStats() {
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
