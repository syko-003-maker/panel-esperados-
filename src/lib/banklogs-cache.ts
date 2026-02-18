/**
 * Simple in-memory cache for banklogs with TTL
 * This prevents repeated DB queries within 60 seconds
 */

import { debug } from "@/lib/logger";

export type BanklogsQueryKey = {
  familyDbId: string;
  page: number;
  limit: number;
  type?: "1" | "2" | null;
  steamId?: string | null;
  days?: number | null;
};

export type CachedBanklogsResult = {
  ok: boolean;
  familySlug: string;
  page: number;
  limit: number;
  total: number;
  items: Array<{
    at: string;
    type: number;
    money: number;
    steamId: string;
  }>;
};

type CacheEntry = {
  data: CachedBanklogsResult;
  expiresAt: number;
};

const CACHE_TTL_MS = 60 * 1000; // 60 seconds
const cache = new Map<string, CacheEntry>();

function generateKey(params: BanklogsQueryKey): string {
  return JSON.stringify({
    familyDbId: params.familyDbId,
    page: params.page,
    limit: params.limit,
    type: params.type ?? null,
    steamId: params.steamId?.trim() ?? null,
    days: params.days ?? null,
  });
}

export function getBanklogsCache(params: BanklogsQueryKey): CachedBanklogsResult | null {
  const key = generateKey(params);
  const entry = cache.get(key);

  if (!entry) {
    return null;
  }

  const now = Date.now();
  if (entry.expiresAt <= now) {
    cache.delete(key);
    return null;
  }

  debug("[banklogs-cache] HIT", {
    page: params.page,
    limit: params.limit,
    remaining: Math.ceil((entry.expiresAt - now) / 1000),
  });

  return entry.data;
}

export function setBanklogsCache(
  params: BanklogsQueryKey,
  data: CachedBanklogsResult
): void {
  const key = generateKey(params);
  const expiresAt = Date.now() + CACHE_TTL_MS;

  cache.set(key, { data, expiresAt });

  debug("[banklogs-cache] SET", {
    page: params.page,
    limit: params.limit,
    ttlSeconds: CACHE_TTL_MS / 1000,
  });
}

export function clearBanklogsCache(): void {
  const count = cache.size;
  cache.clear();
  debug("[banklogs-cache] CLEARED", { count });
}
