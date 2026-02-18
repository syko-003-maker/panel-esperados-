import { NextResponse } from "next/server";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { lygFetchMembers } from "@/lib/lyg-client";
import { logInfo, logWarn } from "@/lib/obs";
import { prisma } from "@/lib/db";

type MemberItem = {
  steamId64: string;
  family?: string;
  rank?: string;
  discordId: string | null;
};

const MEMBERS_CACHE_TTL_MS = 60_000; // 60s cache
const membersCache = new Map<string, { expiresAt: number; items: MemberItem[]; source: "lyg" | "db_stale" }>();

/**
 * Build a map of steamId64 -> discordId from DB for efficient lookup.
 */
async function buildDiscordIdMap(familyId: string): Promise<Map<string, string | null>> {
  const family = await prisma.family.findUnique({
    where: { slug: familyId },
    select: { id: true },
  });

  if (!family) {
    return new Map();
  }

  const members = await prisma.member.findMany({
    where: {
      familyId: family.id,
      isActive: true,
      source: { not: "BANKLOG_GHOST" },
    },
    select: {
      steamId: true,
      discordId: true,
    },
  });

  const map = new Map<string, string | null>();
  members.forEach((m) => {
    if (m.steamId) {
      map.set(m.steamId, m.discordId ?? null);
    }
  });

  return map;
}

/**
 * Fetch members from LYG and merge with DB discordId.
 * This ensures all LYG members have their Discord IDs linked from DB.
 */
async function fetchMembersWithDiscordMerge(familyId: string): Promise<MemberItem[]> {
  // 1. Fetch LYG members
  const result = await lygFetchMembers(familyId, { timeoutMs: 15_000 });
  if (!result.ok) {
    throw new Error(result.error ?? "LYG members fetch failed");
  }

  const lygMembers = result.data ?? [];
  if (!Array.isArray(lygMembers)) {
    throw new Error("LYG members is not an array");
  }

  // 2. Build Discord ID lookup map from DB
  const discordIdMap = await buildDiscordIdMap(familyId);

  // 3. Merge: for each LYG member, add discordId from DB
  const merged: MemberItem[] = lygMembers
    .filter((m) => m && m.steamId64) // Only valid members with steamId64
    .map((m) => {
      const discordId = discordIdMap.get(m.steamId64) ?? null;

      // ✅ Log the merge operation
      console.log("[members-merge]", {
        steamId64: m.steamId64,
        discordId,
      });

      return {
        steamId64: m.steamId64,
        family: m.family,
        rank: m.rank,
        discordId,
      };
    });

  return merged;
}

export async function GET(req: Request) {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const startTime = Date.now();
  const dashboardRequestId = req.headers.get("x-dashboard-request-id");
  const dashboardSection = req.headers.get("x-dashboard-section") ?? "members";
  const logDashboardDone = () => {
    if (dashboardRequestId) {
      logInfo("dashboard_fetch_done", {
        requestId: dashboardRequestId,
        section: dashboardSection,
        durationMs: Date.now() - startTime,
      });
    }
  };

  try {
    const { searchParams } = new URL(req.url);
    const familyId = searchParams.get("familyId") ?? "esperados";
    const q = (searchParams.get("q") ?? "").trim();
    const limit = Math.min(Number(searchParams.get("limit") ?? "200"), 500);
    const countOnly = searchParams.get("countOnly") === "1" || searchParams.get("countOnly") === "true";

    // FAST PATH: countOnly requests - skip LYG entirely, just count from DB
    if (countOnly) {
      try {
        const family = await prisma.family.findUnique({
          where: { slug: familyId },
          select: { id: true },
        });

        const count = family
          ? await prisma.member.count({
              where: {
                familyId: family.id,
                isActive: true,
                // ✅ Exclure les fantômes du count
                source: { not: "BANKLOG_GHOST" },
              },
            })
          : 0;

        logInfo("members_count_fast", {
          familyId,
          count,
          durationMs: Date.now() - startTime,
        });

        logDashboardDone();
        return NextResponse.json({
          ok: true,
          familyId,
          count,
          source: "db_fast",
        });
      } catch (err: any) {
        const errMsg = err?.message ?? String(err);
        logWarn("members_count_error", { familyId, error: errMsg });
        logDashboardDone();
        return NextResponse.json({
          ok: false,
          error: "COUNT_FAILED",
          details: errMsg,
        }, { status: 503 });
      }
    }

    // FULL PATH: normal members list request - use LYG + DB merge + fallback cache
    const cacheKey = familyId;
    const cached = membersCache.get(cacheKey);
    const now = Date.now();

    let normalized: MemberItem[] = [];
    let source: "lyg" | "db_stale" = "lyg";
    let fetchError: string | undefined;

    if (cached && cached.expiresAt > now) {
      normalized = cached.items;
      source = cached.source;
    } else {
      // Try LYG fetch + DB merge first
      try {
        normalized = await fetchMembersWithDiscordMerge(familyId);
        source = "lyg";
        membersCache.set(cacheKey, { expiresAt: now + MEMBERS_CACHE_TTL_MS, items: normalized, source });

        logInfo("members_fetch_lyg_with_merge_success", { familyId, count: normalized.length });
      } catch (err: any) {
        // Fallback: fetch from DB only (no LYG data)
        const errMsg = err?.message ?? String(err);
        fetchError = errMsg;

        logWarn("members_fetch_lyg_failed_fallback_db", {
          familyId,
          error: errMsg,
          fallbackToDb: true,
        });

        try {
          // DB fallback: get all members from DB
          const family = await prisma.family.findUnique({
            where: { slug: familyId },
            select: { id: true },
          });

          if (family) {
            const dbMembers = await prisma.member.findMany({
              where: {
                familyId: family.id,
                isActive: true,
                source: { not: "BANKLOG_GHOST" },
              },
              select: {
                steamId: true,
              },
              take: 500,
            });

            normalized = dbMembers
              .filter((m) => m.steamId)
              .map((m) => ({
                steamId64: m.steamId ?? "",
                family: undefined,
                rank: undefined,
                discordId: null,
              }));
          }

          source = "db_stale";
          membersCache.set(cacheKey, { expiresAt: now + MEMBERS_CACHE_TTL_MS, items: normalized, source });

          logInfo("members_fetch_db_success", { familyId, count: normalized.length });
        } catch (dbErr: any) {
          const dbErrMsg = dbErr?.message ?? String(dbErr);
          logWarn("members_fetch_db_failed", { familyId, error: dbErrMsg });
          
          // Return empty with error
          logDashboardDone();
          return NextResponse.json(
            {
              ok: false,
              error: "FETCH_FAILED",
              details: { lygError: errMsg, dbError: dbErrMsg },
            },
            { status: 503 }
          );
        }
      }
    }

    const filtered = q
      ? normalized.filter((m) => {
          const needle = q.toLowerCase();
          return (
            m.steamId64.toLowerCase().includes(needle) ||
            (m.family ?? "").toLowerCase().includes(needle) ||
            (m.rank ?? "").toLowerCase().includes(needle) ||
            (m.discordId ?? "").toLowerCase().includes(needle)
          );
        })
      : normalized;

    const items = filtered.slice(0, limit).map((m) => ({
      steamId64: m.steamId64,
      family: m.family ?? null,
      rank: m.rank ?? null,
      discordId: m.discordId ?? null,
    }));

    return NextResponse.json({ 
      ok: true, 
      familyId, 
      total: items.length, 
      items,
      source,
      ...(fetchError && { error: fetchError }),
    });
  } catch (err: any) {
    const familyId = "unknown";
    const errMsg = err?.message ?? String(err);
    console.error(`[/api/staff/members] familyId=${familyId} error:`, errMsg);
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  } finally {
    logDashboardDone();
  }
}
