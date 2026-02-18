/**
 * GET /api/cron/cleanup-cache - Clean expired cache and lock entries
 * 
 * Purpose: Periodic maintenance to remove stale entries from database
 * 
 * Recommended schedule: Every 5-10 minutes
 * 
 * Usage with cron (Vercel/Cloudflare):
 * - Vercel: Add to vercel.json cron config
 * - Manual: Call via HTTP from external cron service
 * 
 * Security: Should be protected with CRON_SECRET env var
 */

import { NextRequest, NextResponse } from "next/server";
import { cleanupExpired } from "@/lib/cache";
import { debug } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  // Verify cron secret if configured
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    const providedSecret =
      authHeader?.replace("Bearer ", "") ??
      req.nextUrl.searchParams.get("secret");

    if (providedSecret !== cronSecret) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
  }

  const start = Date.now();

  try {
    debug("[cron/cleanup-cache] Starting cleanup");

    const result = await cleanupExpired();

    const duration = Date.now() - start;

    debug("[cron/cleanup-cache] ✓ Cleanup complete", {
      cacheDeleted: result.cacheDeleted,
      locksDeleted: result.locksDeleted,
      durationMs: duration,
    });

    return NextResponse.json({
      ok: true,
      cacheDeleted: result.cacheDeleted,
      locksDeleted: result.locksDeleted,
      durationMs: duration,
    });
  } catch (err: any) {
    const duration = Date.now() - start;

    console.error("[cron/cleanup-cache] Error:", err);

    return NextResponse.json(
      {
        ok: false,
        error: err.message ?? "Cleanup failed",
        durationMs: duration,
      },
      { status: 500 }
    );
  }
}
