/**
 * GET /api/lyg/members - Cached LYG members with distributed lock
 * 
 * Purpose: Prevent hitting LYG rate limit (150 req/15min)
 * 
 * Strategy:
 * - Cache TTL: 30 minutes (max 2 LYG calls per hour)
 * - Distributed lock: Prevents concurrent fetches across instances
 * - SWR-ready: Returns { data, cached, fetchedAt } for client-side deduping
 * 
 * Rate limit protection:
 * - Members refresh: 30min = 2 calls/hour
 * - Multiple tabs/users: Cache prevents duplicate calls
 * - Concurrent requests: Lock ensures only 1 fetch at a time
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/guards";
import { debug, error as logError } from "@/lib/logger";
import { fetchWithCache } from "@/lib/cache";
import { lygFetchMembers } from "@/lib/lyg-client";
import type { LygMember } from "@/lib/lyg-client";
import { DEFAULT_FAMILY_ID } from "@/lib/family";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Cache TTL: 30 minutes (protect LYG rate limit)
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const LOCK_TTL_MS = 30 * 1000; // 30 seconds (max time to fetch)
const WAIT_FOR_LOCK_MS = 5000; // Wait 5s if another process is fetching

export async function GET(req: NextRequest) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const { searchParams } = req.nextUrl;
  const familyId = searchParams.get("familyId") || DEFAULT_FAMILY_ID;
  const forceRefresh = searchParams.get("force") === "true";

  const cacheKey = `lyg:${familyId}:members`;

  try {
    debug("[lyg/members] Request", {
      familyId,
      forceRefresh,
      cacheKey,
    });

    // Force refresh: delete cache first
    if (forceRefresh) {
      const { deleteCache } = await import("@/lib/cache");
      await deleteCache(cacheKey);
      debug("[lyg/members] Cache cleared (force refresh)", { cacheKey });
    }

    // Fetch with cache + distributed lock
    const result = await fetchWithCache<LygMember[]>(
      cacheKey,
      async () => {
        debug("[lyg/members] Cache miss, fetching from LYG", { familyId });

        const lygResult = await lygFetchMembers(familyId, {
          timeoutMs: 15000,
        });

        if (!lygResult.ok) {
          throw new Error(
            lygResult.error ?? "LYG members fetch failed"
          );
        }

        if (!Array.isArray(lygResult.data)) {
          throw new Error("LYG members response is not an array");
        }

        debug("[lyg/members] ✓ LYG fetch success", {
          count: lygResult.data.length,
          familyId,
        });

        return lygResult.data;
      },
      {
        ttlMs: CACHE_TTL_MS,
        lockTtlMs: LOCK_TTL_MS,
        waitForLockMs: WAIT_FOR_LOCK_MS,
      }
    );

    debug("[lyg/members] ✓ Response", {
      cached: result.cached,
      count: result.data.length,
      fetchedAt: result.fetchedAt,
    });

    return NextResponse.json({
      ok: true,
      data: result.data,
      cached: result.cached,
      fetchedAt: result.fetchedAt.toISOString(),
      ttlMs: CACHE_TTL_MS,
    });
  } catch (err: any) {
    logError("[lyg/members] Error", {
      error: err.message,
      familyId,
    });

    return NextResponse.json(
      {
        ok: false,
        error: err.message ?? "Failed to fetch members",
        familyId,
      },
      { status: 500 }
    );
  }
}
