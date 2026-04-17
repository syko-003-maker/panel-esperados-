import { NextRequest, NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";
import { fetchWithCache, deleteCache } from "@/lib/cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const CACHE_TTL_MS = 60 * 1000;
const LOCK_TTL_MS = 30 * 1000;
const WAIT_FOR_LOCK_MS = 5000;

export async function GET(req: NextRequest) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const familySlug = req.nextUrl.searchParams.get("familyId") || DEFAULT_FAMILY_ID;
  const familyDbId = await resolveFamilyId(familySlug);
  const forceRefresh = req.nextUrl.searchParams.get("force") === "true";
  const limitRaw = Number(req.nextUrl.searchParams.get("limit") ?? 100);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.trunc(limitRaw))) : 100;
  const cacheKey = `lyg:${familySlug}:banklogs:limit=${limit}`;

  try {
    if (forceRefresh) {
      await deleteCache(cacheKey);
    }

    const result = await fetchWithCache<any>(
      cacheKey,
      async () => {
        return prisma.bankLog.findMany({
          where: { familyId: familyDbId },
          orderBy: { at: "desc" },
          take: limit,
          select: {
            id: true,
            at: true,
            type: true,
            money: true,
            steamId: true,
            raw: true,
            createdAt: true,
            updatedAt: true,
          },
        });
      },
      {
        ttlMs: CACHE_TTL_MS,
        lockTtlMs: LOCK_TTL_MS,
        waitForLockMs: WAIT_FOR_LOCK_MS,
      }
    );

    return NextResponse.json({
      ok: true,
      data: result.data,
      cached: result.cached,
      fetchedAt: result.fetchedAt.toISOString(),
      ttlMs: CACHE_TTL_MS,
      source: result.cached ? "db-cache" : "db",
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message ?? "LYG banklogs request failed",
      },
      { status: 500 }
    );
  }
}
