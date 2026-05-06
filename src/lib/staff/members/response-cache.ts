/**
 * Cache module-level pour la response /api/staff/members.
 *
 * Strat :
 *  - cache TTL 15s par signature (clé déterministe)
 *  - coalescing : si une req identique est en flight, les autres callers
 *    attendent la même promise (évite N findMany/Prisma identiques en parallèle)
 *  - LRU à l'éviction (max 32 entrées, ~5 MB total worst case)
 *
 * Polling client = 60s, cache = 15s → la majorité des hits multi-onglets
 * tombent en cache hit.
 *
 * Extrait de app/api/staff/members/route.ts (Lot 7).
 */

const RESPONSE_CACHE_TTL_MS = 15_000;
const RESPONSE_CACHE_MAX_KEYS = 32;

const responseCache = new Map<string, { at: number; payload: unknown }>();
const responseInFlight = new Map<string, Promise<unknown>>();

function trimCacheIfFull(): void {
  if (responseCache.size <= RESPONSE_CACHE_MAX_KEYS) return;
  const oldest = [...responseCache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
  if (oldest) responseCache.delete(oldest[0]);
}

/**
 * Lookup cache. Retourne :
 *  - { hit: true, payload } si cache hit frais
 *  - { hit: false, inFlight } si une promise concurrente existe déjà
 *  - { hit: false, inFlight: null } si on doit vraiment exécuter
 */
export function lookupCache(key: string): {
  hit: boolean;
  payload?: unknown;
  inFlight: Promise<unknown> | null;
} {
  const now = Date.now();
  const cached = responseCache.get(key);
  if (cached && now - cached.at < RESPONSE_CACHE_TTL_MS) {
    return { hit: true, payload: cached.payload, inFlight: null };
  }
  const inFlight = responseInFlight.get(key) ?? null;
  return { hit: false, inFlight };
}

/**
 * Acquérir un slot in-flight pour cette clé.
 * Le caller doit appeler le finish() retourné quand il a un payload (ou erreur).
 * Plusieurs callers concurrents pour la même clé : seul le premier acquiert
 * réellement, les suivants reçoivent le même promise via lookupCache().inFlight.
 */
export function acquireFlight(key: string): {
  finish: (payload: unknown, err?: unknown) => void;
} {
  let resolveFlight!: (v: unknown) => void;
  let rejectFlight!: (e: unknown) => void;
  const flightPromise = new Promise<unknown>((res, rej) => {
    resolveFlight = res;
    rejectFlight = rej;
  });
  responseInFlight.set(key, flightPromise);

  return {
    finish: (payload: unknown, err?: unknown) => {
      if (err) rejectFlight(err);
      else resolveFlight(payload);
      responseInFlight.delete(key);
    },
  };
}

export function storeInCache(key: string, payload: unknown): void {
  responseCache.set(key, { at: Date.now(), payload });
  trimCacheIfFull();
}

/**
 * Helper de test : vide le cache. Ne pas utiliser en prod.
 */
export function _resetCacheForTests(): void {
  responseCache.clear();
  responseInFlight.clear();
}
