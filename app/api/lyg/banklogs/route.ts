/**
 * GET /api/lyg/banklogs - Cached LYG banklogs with distributed lock
 * 
 * Purpose: Prevent hitting LYG rate limit (150 req/15min)
 * 
 * Strategy:
 * - Cache TTL: 60 seconds (max 60 LYG calls per hour)
 * - Distributed lock: Prevents concurrent fetches across instances
 * - SWR-ready: Returns { data, cached, fetchedAt } for client-side deduping
 * 
 * Rate limit protection:
 * - Banklogs refresh: 60s = 60 calls/hour
 * - Multiple tabs/users: Cache prevents duplicate calls
 * - Concurrent requests: Lock ensures only 1 fetch at a time
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/guards";
import { debug, error as logError } from "@/lib/logger";
import { fetchWithCache } from "@/lib/cache";
import { fetchLygBanklogs } from "@/lib/lyg-banklogs";
import { DEFAULT_FAMILY_ID } from "@/lib/family";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Cache TTL: 60 seconds (higher refresh rate for financial data)
const CACHE_TTL_MS = 60 * 1000; // 60 seconds
const LOCK_TTL_MS = 30 * 1000; // 30 seconds (max time to fetch)
const WAIT_FOR_LOCK_MS = 5000; // Wait 5s if another process is fetching

export async function GET(req: NextRequest) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const { searchParams } = req.nextUrl;
  const familyId = searchParams.get("familyId") || DEFAULT_FAMILY_ID;
  const forceRefresh = searchParams.get("force") === "true";

  const cacheKey = `lyg:${familyId}:banklogs`;

  try {
    debug("[lyg/banklogs] Request", {
      familyId,
      forceRefresh,
      cacheKey,
      usingServerToken: true,
    });

    // Force refresh: delete cache first
    if (forceRefresh) {
      const { deleteCache } = await import("@/lib/cache");
      await deleteCache(cacheKey);
      debug("[lyg/banklogs] Cache cleared (force refresh)", { cacheKey });
    }

    // Fetch with cache + distributed lock
    const result = await fetchWithCache<any>(
      cacheKey,
      async () => {
        debug("[lyg/banklogs] Cache miss, fetching from LYG", { familyId });

        const lygResult = await fetchLygBanklogs(familyId, {
          timeoutMs: 15000,
        });

        if (!lygResult.ok) {
          throw new Error(
            lygResult.error ?? "LYG banklogs fetch failed"
          );
        }

        debug("[lyg/banklogs] ✓ LYG fetch success", {
          dataLength: Array.isArray(lygResult.data)
            ? lygResult.data.length
            : "N/A",
          familyId,
        });

        return lygResult.data ?? {};
      },
      {
        ttlMs: CACHE_TTL_MS,
        lockTtlMs: LOCK_TTL_MS,
        waitForLockMs: WAIT_FOR_LOCK_MS,
      }
    );

    debug("[lyg/banklogs] ✓ Response", {
      cached: result.cached,
      dataLength: Array.isArray(result.data) ? result.data.length : "N/A",
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
    logError("[lyg/banklogs] Error", {
      error: err.message,
    });

    return NextResponse.json(
      {
        ok: false,
        error: err.message ?? "LYG banklogs request failed",
      },
      { status: 500 }
    );
  }
}
