/**
 * Global Cache & Lock Utilities
 * Purpose: Prevent LYG rate limits (150 req/15min) via DB cache + distributed locks
 * 
 * Features:
 * - DB-backed cache (CacheKV table) - works across multi-instance deployments
 * - Distributed lock (Lock table) - prevents concurrent fetches
 * - In-memory inflight tracking - optimization for same-instance requests
 * - Auto-cleanup of expired entries
 */

import { prisma } from "@/lib/db";
import { debug } from "@/lib/logger";
import { randomUUID } from "crypto";

// In-memory inflight tracking (same instance only)
const inflightRequests = new Map<string, Promise<any>>();

export type CacheEntry<T = any> = {
  data: T;
  fetchedAt: Date;
  expiresAt: Date;
};

/**
 * Get cached value if not expired
 */
export async function getCache<T = any>(
  key: string
): Promise<CacheEntry<T> | null> {
  try {
    const entry = await prisma.cacheKV.findUnique({
      where: { key },
    });

    if (!entry) {
      debug("[cache] Miss", { key });
      return null;
    }

    const now = new Date();
    if (entry.expiresAt < now) {
      debug("[cache] Expired", { key, expiresAt: entry.expiresAt });
      // Clean up expired entry
      await prisma.cacheKV.delete({ where: { key } }).catch(() => {});
      return null;
    }

    debug("[cache] Hit", { key, age: now.getTime() - entry.updatedAt.getTime() });
    return {
      data: entry.value as T,
      fetchedAt: entry.updatedAt,
      expiresAt: entry.expiresAt,
    };
  } catch (err) {
    debug("[cache] Error reading cache", {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Set cache value with TTL
 */
export async function setCache<T = any>(
  key: string,
  data: T,
  ttlMs: number
): Promise<void> {
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttlMs);

    await prisma.cacheKV.upsert({
      where: { key },
      update: {
        value: data as any,
        expiresAt,
      },
      create: {
        key,
        value: data as any,
        expiresAt,
      },
    });

    debug("[cache] Set", { key, ttlMs, expiresAt });
  } catch (err) {
    debug("[cache] Error writing cache", {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Delete cache entry
 */
export async function deleteCache(key: string): Promise<void> {
  try {
    await prisma.cacheKV.delete({ where: { key } });
    debug("[cache] Deleted", { key });
  } catch (err) {
    // Ignore not found errors
  }
}

/**
 * Acquire distributed lock
 * @returns holder ID if acquired, null if already locked
 */
export async function acquireLock(
  key: string,
  ttlMs = 30000
): Promise<string | null> {
  const holder = randomUUID();
  const expiresAt = new Date(Date.now() + ttlMs);

  try {
    // Try to create lock
    await prisma.lock.create({
      data: {
        key,
        holder,
        expiresAt,
      },
    });

    debug("[lock] Acquired", { key, holder: holder.substring(0, 8), ttlMs });
    return holder;
  } catch (err) {
    // Lock already exists, check if expired
    try {
      const existing = await prisma.lock.findUnique({ where: { key } });

      if (existing && existing.expiresAt < new Date()) {
        // Lock expired, take over
        await prisma.lock.update({
          where: { key },
          data: {
            holder,
            expiresAt,
          },
        });

        debug("[lock] Took over expired lock", {
          key,
          holder: holder.substring(0, 8),
        });
        return holder;
      }

      debug("[lock] Already locked", {
        key,
        expiresAt: existing?.expiresAt,
      });
      return null;
    } catch (err2) {
      debug("[lock] Error checking existing lock", {
        key,
        error: err2 instanceof Error ? err2.message : String(err2),
      });
      return null;
    }
  }
}

/**
 * Release distributed lock
 */
export async function releaseLock(key: string, holder: string): Promise<void> {
  try {
    await prisma.lock.delete({
      where: {
        key,
        holder, // Only delete if we're the holder
      },
    });

    debug("[lock] Released", { key, holder: holder.substring(0, 8) });
  } catch (err) {
    // Ignore errors (lock may have already expired/been taken over)
  }
}

/**
 * Fetch with cache and lock
 * 
 * Pattern:
 * 1. Check cache, return if valid
 * 2. Check inflight request (same instance), join if exists
 * 3. Acquire lock
 * 4. If locked by another process, wait briefly and return stale cache if available
 * 5. Fetch data, update cache, release lock
 */
export async function fetchWithCache<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  options: {
    ttlMs: number;
    lockTtlMs?: number;
    waitForLockMs?: number;
  }
): Promise<{ data: T; cached: boolean; fetchedAt: Date }> {
  const { ttlMs, lockTtlMs = 30000, waitForLockMs = 2000 } = options;

  // 1. Check cache
  const cached = await getCache<T>(cacheKey);
  if (cached) {
    return {
      data: cached.data,
      cached: true,
      fetchedAt: cached.fetchedAt,
    };
  }

  // 2. Check inflight (same instance optimization)
  const inflight = inflightRequests.get(cacheKey);
  if (inflight) {
    debug("[cache] Joining inflight request", { cacheKey });
    try {
      const data = await inflight;
      const entry = await getCache<T>(cacheKey);
      return {
        data: entry?.data ?? data,
        cached: true,
        fetchedAt: entry?.fetchedAt ?? new Date(),
      };
    } catch (err) {
      // Inflight failed, continue to fetch
    }
  }

  // 3. Acquire lock
  const lockKey = `lock:${cacheKey}`;
  const holder = await acquireLock(lockKey, lockTtlMs);

  if (!holder) {
    // Locked by another process, wait briefly then return stale cache or error
    debug("[cache] Locked by another process, waiting", {
      cacheKey,
      waitMs: waitForLockMs,
    });

    await new Promise((resolve) => setTimeout(resolve, waitForLockMs));

    // Check cache again (other process may have populated it)
    const cachedAfterWait = await getCache<T>(cacheKey);
    if (cachedAfterWait) {
      return {
        data: cachedAfterWait.data,
        cached: true,
        fetchedAt: cachedAfterWait.fetchedAt,
      };
    }

    throw new Error("Resource locked and no cached data available");
  }

  // 4. Fetch data with inflight tracking
  const fetchPromise = (async () => {
    try {
      const data = await fetcher();
      await setCache(cacheKey, data, ttlMs);
      return data;
    } finally {
      inflightRequests.delete(cacheKey);
      await releaseLock(lockKey, holder);
    }
  })();

  inflightRequests.set(cacheKey, fetchPromise);

  const data = await fetchPromise;
  return {
    data,
    cached: false,
    fetchedAt: new Date(),
  };
}

/**
 * Clean up expired cache and lock entries
 * Call periodically (e.g., cron job or on startup)
 */
export async function cleanupExpired(): Promise<{
  cacheDeleted: number;
  locksDeleted: number;
}> {
  const now = new Date();

  try {
    const [cacheResult, lockResult] = await Promise.all([
      prisma.cacheKV.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
      prisma.lock.deleteMany({
        where: { expiresAt: { lt: now } },
      }),
    ]);

    debug("[cache] Cleanup complete", {
      cacheDeleted: cacheResult.count,
      locksDeleted: lockResult.count,
    });

    return {
      cacheDeleted: cacheResult.count,
      locksDeleted: lockResult.count,
    };
  } catch (err) {
    debug("[cache] Cleanup error", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { cacheDeleted: 0, locksDeleted: 0 };
  }
}
