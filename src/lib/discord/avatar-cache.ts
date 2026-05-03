/**
 * Cache mémoire partagé pour les hashes d'avatar Discord.
 * Persiste entre les requêtes dans le même process Node.js.
 *
 * Stratégie deux vitesses :
 *  - getAvatarHashesFast : cache mémoire + Account table uniquement (<100 ms)
 *  - getAvatarHashes     : complet (inclut Discord API avec retry/déduplication)
 *
 * L'endpoint /api/staff/avatars répond immédiatement via getAvatarHashesFast
 * et déclenche getAvatarHashes en arrière-plan pour peupler le cache.
 * Le hook useDiscordAvatars refait un appel après 4 s pour récupérer le reste.
 */

import { extractDiscordAvatarHash, getDiscordAvatarUrl } from "./getDiscordAvatarUrl";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// Cache principal
// ---------------------------------------------------------------------------

const cache = new Map<string, { hash: string | null; fetchedAt: number }>();
const TTL_HIT  = 60 * 60 * 1000; // 1 h pour les vrais hashes
const TTL_MISS = 5  * 60 * 1000; // 5 min pour "pas d'avatar sur Discord"

// ---------------------------------------------------------------------------
// Déduplication : Promise en cours par discordId
// ---------------------------------------------------------------------------

const inFlight = new Map<string, Promise<string | null>>();

// ---------------------------------------------------------------------------
// Fetch Discord API (avec retry sur 429)
// ---------------------------------------------------------------------------

async function fetchOneHash(discordId: string, botToken: string): Promise<string | null> {
  const MAX_RETRIES = 5;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
        headers: { Authorization: `Bot ${botToken}` },
        signal: AbortSignal.timeout(6000),
      });
    } catch {
      return null;
    }

    if (res.status === 429) {
      let waitMs = 1200;
      try {
        const body = (await res.json()) as { retry_after?: number };
        waitMs = Math.min(Math.ceil((body.retry_after ?? 1) * 1000) + 150, 15_000);
      } catch { /* ignore */ }
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    if (!res.ok) return null;

    const user = (await res.json()) as { avatar?: string | null };
    return user.avatar ?? null;
  }

  return null;
}

function fetchAndCache(discordId: string, botToken: string): Promise<string | null> {
  const existing = inFlight.get(discordId);
  if (existing) return existing;

  const promise = fetchOneHash(discordId, botToken)
    .then((hash) => {
      inFlight.delete(discordId);
      cache.set(discordId, { hash, fetchedAt: Date.now() });
      return hash;
    })
    .catch(() => {
      inFlight.delete(discordId);
      return null as string | null;
    });

  inFlight.set(discordId, promise);
  return promise;
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/**
 * Version RAPIDE : cache mémoire + Account table uniquement.
 * Ne fait aucun appel Discord API. Réponse en < 100 ms.
 * Retourne null pour les IDs absents du cache.
 */
export async function getAvatarHashesFast(
  discordIds: string[]
): Promise<Map<string, string | null>> {
  if (!discordIds.length) return new Map();

  const result      = new Map<string, string | null>();
  const now         = Date.now();
  const needFetch: string[] = [];

  // 1. Cache mémoire
  for (const id of discordIds) {
    const cached = cache.get(id);
    if (cached) {
      const ttl = cached.hash ? TTL_HIT : TTL_MISS;
      if (now - cached.fetchedAt < ttl) {
        result.set(id, cached.hash);
        continue;
      }
    }
    needFetch.push(id);
  }

  if (!needFetch.length) return result;

  // 2. Account table uniquement
  const accounts = await prisma.account.findMany({
    where: { provider: "discord", providerAccountId: { in: needFetch } },
    select: { providerAccountId: true, user: { select: { image: true } } },
  }).catch(() => []);

  for (const id of needFetch) {
    const account = accounts.find((a) => a.providerAccountId === id);
    if (account) {
      const hash = extractDiscordAvatarHash(account.user?.image);
      result.set(id, hash);
      cache.set(id, { hash, fetchedAt: now });
    }
    // IDs non trouvés → pas dans le résultat (le caller recevra undefined)
  }

  return result;
}

/**
 * Déclenche le fetch Discord API en arrière-plan pour les IDs manquants.
 * Ne bloque pas — retourne immédiatement.
 */
export function warmAvatarCache(discordIds: string[]): void {
  const botToken = (process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN ?? "").trim();
  if (!botToken || !discordIds.length) return;

  const now         = Date.now();
  const toFetch     = discordIds.filter((id) => {
    const cached = cache.get(id);
    if (!cached) return true;
    const ttl = cached.hash ? TTL_HIT : TTL_MISS;
    return now - cached.fetchedAt >= ttl;
  });

  if (!toFetch.length) return;

  // Lancer en arrière-plan — concurrence 5 + 100 ms entre lots
  // Le retry sur 429 gère les rate-limits, pas besoin d'un gros délai préventif
  void (async () => {
    const CONCURRENCY       = 5;
    const INTER_BATCH_DELAY = 100;

    for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
      const batch = toFetch.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map((id) => fetchAndCache(id, botToken)));
      if (i + CONCURRENCY < toFetch.length) {
        await new Promise((r) => setTimeout(r, INTER_BATCH_DELAY));
      }
    }
  })();
}

/**
 * Version COMPLÈTE : cache + Account table + Discord API.
 * Peut prendre 20+ s sur cache froid. Préférer getAvatarHashesFast + warmAvatarCache.
 */
export async function getAvatarHashes(
  discordIds: string[]
): Promise<Map<string, string | null>> {
  if (!discordIds.length) return new Map();

  const result      = new Map<string, string | null>();
  const now         = Date.now();
  const needFetch: string[] = [];

  // 1. Cache mémoire
  for (const id of discordIds) {
    const cached = cache.get(id);
    if (cached) {
      const ttl = cached.hash ? TTL_HIT : TTL_MISS;
      if (now - cached.fetchedAt < ttl) {
        result.set(id, cached.hash);
        continue;
      }
    }
    needFetch.push(id);
  }

  if (!needFetch.length) return result;

  // 2. Account table
  const accounts = await prisma.account.findMany({
    where: { provider: "discord", providerAccountId: { in: needFetch } },
    select: { providerAccountId: true, user: { select: { image: true } } },
  }).catch(() => []);

  const stillMissing: string[] = [];
  for (const id of needFetch) {
    const account = accounts.find((a) => a.providerAccountId === id);
    if (account) {
      const hash = extractDiscordAvatarHash(account.user?.image);
      result.set(id, hash);
      cache.set(id, { hash, fetchedAt: now });
    } else {
      stillMissing.push(id);
    }
  }

  if (!stillMissing.length) return result;

  // 3. Discord API
  const botToken = (process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN ?? "").trim();
  if (!botToken) {
    for (const id of stillMissing) result.set(id, null);
    return result;
  }

  const CONCURRENCY       = 3;
  const INTER_BATCH_DELAY = 300;

  for (let i = 0; i < stillMissing.length; i += CONCURRENCY) {
    const batch  = stillMissing.slice(i, i + CONCURRENCY);
    const hashes = await Promise.all(batch.map((id) => fetchAndCache(id, botToken)));
    for (let j = 0; j < batch.length; j++) {
      result.set(batch[j], hashes[j]);
    }
    if (i + CONCURRENCY < stillMissing.length) {
      await new Promise((r) => setTimeout(r, INTER_BATCH_DELAY));
    }
  }

  return result;
}

/**
 * Construit une map steamId → avatarUrl à partir d'une map steamId → discordId.
 */
export async function buildAvatarUrlBySteam(
  discordIdBySteam: Map<string, string>
): Promise<Map<string, string | null>> {
  const allDiscordIds = [...new Set(discordIdBySteam.values())];
  const hashes        = await getAvatarHashes(allDiscordIds);

  const result = new Map<string, string | null>();
  for (const [steamId, discordId] of discordIdBySteam) {
    const hash = hashes.get(discordId) ?? null;
    result.set(steamId, getDiscordAvatarUrl(discordId, hash));
  }
  return result;
}
