/**
 * Discord batch member verification with cache + backoff + "last known good"
 * Purpose: Reliable Discord verification without rate-limit failures
 * 
 * How it works:
 * 1. Check in-memory cache (5-15 min TTL)
 * 2. If miss: defer to API with concurrency limit + retry_after
 * 3. If 429: Use stale cache OR return RATE_LIMIT (non-fatal)
 * 4. Persist to DB (DiscordSnapshot) for "last known good" fallback
 * 5. Respect Discord rate limits: 50 reqs/sec per bot
 */

import { prisma } from "@/lib/db";
import { debug, warn, error as logError } from "@/lib/logger";
import { createDelay } from "@/lib/utils/delay";

const DISCORD_TOKEN = (process.env.DISCORD_TOKEN ?? process.env.DISCORD_BOT_TOKEN ?? "").trim();
const GUILD_ID = (process.env.GUILD_ID ?? process.env.DISCORD_GUILD_ID ?? "").trim();

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const CACHE_STALE_TTL_MS = 60 * 60 * 1000; // 1 hour (for fallback)
const CONCURRENCY = 3; // Be conservative with rate limits
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30000;

export type DiscordMemberStatus = {
  ok: boolean;
  inGuild?: boolean;
  roles?: string[];
  fetchedAt?: Date;
  source?: "live" | "cache" | "lastKnownGood";
  errorCode?: "RATE_LIMIT" | "CONFIG_MISSING" | "UNAVAILABLE";
};

// In-memory cache
const cache = new Map<
  string,
  {
    value: DiscordMemberStatus;
    expiresAt: number;
    staleExpiresAt: number;
  }
>();

let globalRetryAfterMs = 0; // Respect global rate limit
let lastRateLimitTime = 0;

function getCache(
  discordId: string,
  allowStale = false
): DiscordMemberStatus | null {
  const entry = cache.get(discordId);
  if (!entry) return null;

  const now = Date.now();

  // Fresh cache?
  if (entry.expiresAt > now) {
    return {
      ...entry.value,
      source: "cache",
    };
  }

  // Stale cache allowed?
  if (allowStale && entry.staleExpiresAt > now) {
    return {
      ...entry.value,
      source: "cache", // Still from cache, just older
    };
  }

  return null;
}

function setCache(discordId: string, value: DiscordMemberStatus) {
  const now = Date.now();
  cache.set(discordId, {
    value,
    expiresAt: now + CACHE_TTL_MS,
    staleExpiresAt: now + CACHE_STALE_TTL_MS,
  });
}

async function persistSnapshot(
  discordId: string,
  status: DiscordMemberStatus,
  source: "live" | "cache" | "lastKnownGood"
) {
  try {
    await prisma.discordSnapshot.upsert({
      where: { discordId },
      update: {
        inGuild: status.inGuild ?? false,
        roles: status.roles || [],
        fetchedAt: new Date(),
        source,
        ...(status.ok && !status.errorCode ? { lastOkAt: new Date() } : {}),
        ...(status.errorCode
          ? { lastErrorCode: status.errorCode, lastErrorAt: new Date() }
          : {}),
      },
      create: {
        discordId,
        inGuild: status.inGuild ?? false,
        roles: status.roles || [],
        source,
        lastOkAt: status.ok && !status.errorCode ? new Date() : undefined,
        lastErrorCode: status.errorCode,
        lastErrorAt: status.errorCode ? new Date() : undefined,
      },
    });
  } catch (err) {
    debug("[discord-batch] Failed to persist snapshot", {
      discordId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function fetchFromLastKnownGood(
  discordId: string
): Promise<DiscordMemberStatus | null> {
  try {
    const snapshot = await prisma.discordSnapshot.findUnique({
      where: { discordId },
    });

    if (
      snapshot &&
      snapshot.lastOkAt &&
      Date.now() - snapshot.lastOkAt.getTime() < 24 * 60 * 60 * 1000
    ) {
      // Last OK was within 24h
      return {
        ok: true,
        inGuild: snapshot.inGuild ?? undefined,
        roles: snapshot.roles || [],
        fetchedAt: snapshot.lastOkAt,
        source: "lastKnownGood",
      };
    }
  } catch (err) {
    debug("[discord-batch] Error fetching lastKnownGood", {
      discordId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return null;
}

async function fetchMemberStatusLive(
  discordId: string,
  retryCount = 0
): Promise<DiscordMemberStatus> {
  if (!DISCORD_TOKEN || !GUILD_ID) {
    return { ok: false, errorCode: "CONFIG_MISSING" };
  }

  // Respect global rate limit
  const now = Date.now();
  if (globalRetryAfterMs > 0 && now < lastRateLimitTime + globalRetryAfterMs) {
    const waitMs = lastRateLimitTime + globalRetryAfterMs - now;
    debug("[discord-batch] Waiting for global rate limit recovery", {
      waitMs,
    });
    await createDelay(Math.min(waitMs, 5000)); // Max 5s wait
  }

  const url = `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordId}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bot ${DISCORD_TOKEN}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    // 404 = not in guild
    if (res.status === 404) {
      const value: DiscordMemberStatus = {
        ok: true,
        inGuild: false,
        roles: [],
      };
      setCache(discordId, value);
      await persistSnapshot(discordId, value, "live");
      return value;
    }

    // 429 = rate limited
    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After");
      const retryAfterMs = retryAfter
        ? parseInt(retryAfter) * 1000
        : BACKOFF_BASE_MS * Math.pow(2, Math.min(retryCount, 3));

      lastRateLimitTime = now;
      globalRetryAfterMs = retryAfterMs;

      warn("[discord-batch] 429 Rate limit", {
        discordId,
        retryAfter,
        retryAfterMs,
        retryCount,
      });

      // Try stale cache first
      const staleCache = getCache(discordId, true);
      if (staleCache) {
        debug("[discord-batch] Using stale cache for 429", { discordId });
        return {
          ...staleCache,
          source: "cache",
          fetchedAt: new Date(),
        };
      }

      // Try last known good
      const lastGood = await fetchFromLastKnownGood(discordId);
      if (lastGood) {
        debug("[discord-batch] Using lastKnownGood for 429", { discordId });
        return lastGood;
      }

      // Retry exponentially (up to 3 times)
      if (retryCount < 3) {
        await createDelay(retryAfterMs);
        return fetchMemberStatusLive(discordId, retryCount + 1);
      }

      // Give up: return RATE_LIMIT (non-fatal)
      return { ok: false, errorCode: "RATE_LIMIT" };
    }

    // Other errors (401, 403, 500, etc.)
    if (!res.ok) {
      warn("[discord-batch] Discord API error", {
        discordId,
        status: res.status,
      });

      const lastGood = await fetchFromLastKnownGood(discordId);
      if (lastGood) {
        return lastGood;
      }

      return { ok: false, errorCode: "UNAVAILABLE" };
    }

    // Success: parse member data
    let text = "";
    try {
      text = await res.text();
    } catch {}

    let member: { roles?: string[] } | null = null;
    try {
      member = text ? (JSON.parse(text) as { roles?: string[] }) : null;
    } catch {}

    const roles = Array.isArray(member?.roles) ? member.roles : [];
    const value: DiscordMemberStatus = {
      ok: true,
      inGuild: true,
      roles,
    };

    setCache(discordId, value);
    await persistSnapshot(discordId, value, "live");

    return value;
  } catch (err) {
    logError("[discord-batch] Network error", {
      discordId,
      error: err instanceof Error ? err.message : String(err),
    });

    // Fall back to lastKnownGood
    const lastGood = await fetchFromLastKnownGood(discordId);
    if (lastGood) {
      return lastGood;
    }

    return { ok: false, errorCode: "UNAVAILABLE" };
  }
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  const workers = new Array(Math.min(limit, items.length)).fill(null).map(
    async () => {
      while (index < items.length) {
        const current = index++;
        try {
          results[current] = await worker(items[current]);
        } catch (err) {
          results[current] = {
            ok: false,
            errorCode: "UNAVAILABLE",
          } as any;
        }
      }
    }
  );

  await Promise.all(workers);
  return results;
}

/**
 * Batch fetch Discord member statuses with cache + backoff + resilience
 */
export async function batchFetchDiscordMembers(
  discordIds: string[]
): Promise<Record<string, DiscordMemberStatus>> {
  if (!discordIds.length) return {};

  debug("[discord-batch] Fetching batch", { count: discordIds.length });

  // Deduplicate
  const uniqueIds = Array.from(new Set(discordIds));

  // Try cache first
  const cached = new Map<string, DiscordMemberStatus>();
  const tocache: string[] = [];

  for (const discordId of uniqueIds) {
    const fromCache = getCache(discordId);
    if (fromCache) {
      cached.set(discordId, fromCache);
    } else {
      tocache.push(discordId);
    }
  }

  if (tocache.length === 0) {
    const result: Record<string, DiscordMemberStatus> = {};
    for (const [discordId, status] of cached) {
      result[discordId] = status;
    }
    debug("[discord-batch] All from cache", { count: cached.size });
    return result;
  }

  // Fetch live with concurrency
  const fetched = await runWithConcurrency(
    tocache,
    CONCURRENCY,
    async (discordId) => {
      const status = await fetchMemberStatusLive(discordId);
      return { discordId, status };
    }
  );

  // Combine results
  const result: Record<string, DiscordMemberStatus> = {};

  for (const [discordId, status] of cached) {
    result[discordId] = status;
  }

  for (const { discordId, status } of fetched) {
    result[discordId] = {
      ...status,
      fetchedAt: new Date(),
    };
  }

  debug("[discord-batch] Fetch complete", {
    totalRequested: uniqueIds.length,
    fromCache: cached.size,
    cacheHitRate: `${Math.round((cached.size / uniqueIds.length) * 100)}%`,
    fromLive: fetched.length,
    stats: {
      ok: fetched.filter((f) => f.status.ok).length,
      rateLimited: fetched.filter((f) => f.status.errorCode === "RATE_LIMIT").length,
      unavailable: fetched.filter((f) => f.status.errorCode === "UNAVAILABLE").length,
      configMissing: fetched.filter((f) => f.status.errorCode === "CONFIG_MISSING").length,
    },
  });

  return result;
}

/**
 * Verify Discord configuration and permissions
 */
export async function verifyDiscordConfig(): Promise<{
  configured: boolean;
  issues: string[];
}> {
  const issues: string[] = [];

  if (!DISCORD_TOKEN) {
    issues.push("DISCORD_TOKEN or DISCORD_BOT_TOKEN not set");
  }

  if (!GUILD_ID) {
    issues.push("GUILD_ID or DISCORD_GUILD_ID not set");
  }

  if (!DISCORD_TOKEN || !GUILD_ID) {
    return { configured: false, issues };
  }

  // Try a simple request to verify token
  try {
    const res = await fetch(
      `https://discord.com/api/v10/guilds/${GUILD_ID}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bot ${DISCORD_TOKEN}`,
        },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (res.status === 401) {
      issues.push("Invalid bot token");
    } else if (res.status === 403) {
      issues.push(
        "Bot lacks permissions on guild. Check URL or permissions."
      );
    } else if (res.status === 404) {
      issues.push("Guild not found with this ID");
    } else if (!res.ok) {
      issues.push(`Guild fetch failed: HTTP ${res.status}`);
    }
  } catch (err) {
    issues.push(
      `Network error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  return {
    configured: issues.length === 0,
    issues,
  };
}
