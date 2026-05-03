/**
 * Cache mémoire partagé pour les hashes d'avatar Discord.
 * Persiste entre les requêtes dans le même process Node.js.
 * Utilisé par la page membres ET la page stats.
 */

import { extractDiscordAvatarHash, getDiscordAvatarUrl } from "./getDiscordAvatarUrl";
import { prisma } from "@/lib/db";

const cache = new Map<string, { hash: string | null; fetchedAt: number }>();
const TTL_HIT  = 60 * 60 * 1000;  // 1h pour les vrais hashes
const TTL_MISS = 5  * 60 * 1000;  // 5min pour les vrais "no avatar" (Discord renvoie null)

// IDs dont la requête a été bloquée par un rate-limit — on ne les met pas en cache
// pour les re-tenter rapidement à la prochaine page view.
const rateLimitedIds = new Set<string>();

/**
 * Appel Discord API avec retry automatique sur 429 (rate limit).
 * Respecte le header Retry-After retourné par Discord.
 * Timeout par tentative : 5 s. Maximum 3 tentatives.
 */
async function fetchDiscordUser(
  discordId: string,
  botToken: string
): Promise<{ discordId: string; hash: string | null } | null> {
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let res: Response;
    try {
      res = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
        headers: { Authorization: `Bot ${botToken}` },
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      // Timeout ou erreur réseau — on abandonne pour cet ID
      return null;
    }

    if (res.status === 429) {
      // Lire le header Retry-After (en secondes, float possible)
      const retryAfter = parseFloat(res.headers.get("Retry-After") ?? "1");
      const waitMs = Math.min(Math.ceil(retryAfter * 1000) + 100, 10_000);
      await new Promise((r) => setTimeout(r, waitMs));
      continue; // retry
    }

    if (!res.ok) return null; // 404, 401, etc. — pas la peine de retenter

    const user = (await res.json()) as { avatar?: string | null };
    return { discordId, hash: user.avatar ?? null };
  }

  // Toujours rate-limité après MAX_RETRIES — on signale sans mettre en cache
  return null;
}

/**
 * Retourne les hashes d'avatar pour une liste de discordIds.
 * Stratégie :
 *  1. Cache mémoire (TTL 1h)
 *  2. Table Account (membres connectés au panel)
 *  3. Discord API directe (bot token) — séquentiel avec gestion du rate-limit
 */
export async function getAvatarHashes(
  discordIds: string[]
): Promise<Map<string, string | null>> {
  if (!discordIds.length) return new Map();

  const result = new Map<string, string | null>();
  const now    = Date.now();
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

  // 2. Table Account (DB) — pour les membres connectés au panel
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

  // 3. Discord API directe — pour les membres jamais connectés au panel
  const botToken = (process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN ?? "").trim();
  if (!botToken) {
    // Pas de token : on ne met pas en cache pour réessayer dès que le token est dispo
    for (const id of stillMissing) result.set(id, null);
    return result;
  }

  // Traitement séquentiel par petits groupes pour éviter le rate-limit.
  // On ne parallélise pas massivement : Discord bloque à ~30 req/s global.
  const CONCURRENCY = 3;
  const INTER_BATCH_DELAY_MS = 250; // délai entre chaque groupe

  for (let i = 0; i < stillMissing.length; i += CONCURRENCY) {
    const batch = stillMissing.slice(i, i + CONCURRENCY);

    const settled = await Promise.allSettled(
      batch.map((id) => fetchDiscordUser(id, botToken))
    );

    for (let j = 0; j < batch.length; j++) {
      const id = batch[j];
      const s  = settled[j];

      if (s.status === "fulfilled" && s.value !== null) {
        const { hash } = s.value;
        result.set(id, hash);
        cache.set(id, { hash, fetchedAt: now });
        rateLimitedIds.delete(id); // succès — retirer de la liste noire
      } else {
        // null = rate-limit persistant ou erreur réseau : NE PAS mettre en cache
        // L'ID sera re-tenté à la prochaine requête
        result.set(id, null);
        rateLimitedIds.add(id);
      }
    }

    // Pause entre les groupes pour rester sous le rate-limit Discord
    if (i + CONCURRENCY < stillMissing.length) {
      await new Promise((r) => setTimeout(r, INTER_BATCH_DELAY_MS));
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
