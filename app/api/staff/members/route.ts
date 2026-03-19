import { NextResponse } from "next/server";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { logInfo, logWarn } from "@/lib/obs";
import { prisma } from "@/lib/db";
import { getGradeBadgeProps } from "@/lib/grade-colors";
import { getMemberDisplayName, resolveStableRank } from "@/lib/member-display";
import type { StaffMemberDto } from "@/types/staff";
import { extractDiscordAvatarHash } from "@/lib/discord/getDiscordAvatarUrl";

type MemberItem = {
  id: string;
  steamId64: string;
  family?: string | null;
  rank?: string | null;
  discordId: string | null;
  discordAvatarHash: string | null;
  discordStatus: "OK" | "HORS_DISCORD" | "NON_VERIFIE";
  rpName?: string | null;
  grade?: string | null;
  gradeLevel?: number;
  playtime7d: number;
  playtime7dUpdatedAt: string | null;
  updatedAt: string;
};


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
    // Accept both `search` (documented) and `q` (legacy alias)
    const q = (searchParams.get("search") ?? searchParams.get("q") ?? "").trim();
    const sortBy = searchParams.get("sortBy") ?? "name";
    const sortDir = searchParams.get("sortDir") === "desc" ? "desc" : "asc";
    const limit = Math.min(Number(searchParams.get("limit") ?? "200"), 500);
    const countOnly = searchParams.get("countOnly") === "1" || searchParams.get("countOnly") === "true";

    // FAST PATH: countOnly requests - DB only
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

    const family = await prisma.family.findUnique({
      where: { slug: familyId },
      select: { id: true, slug: true, name: true },
    });

    if (!family) {
      logWarn("members_fetch_db_failed", { familyId, error: "Family not found" });
      logDashboardDone();
      return NextResponse.json(
        { ok: false, error: "FAMILY_NOT_FOUND" },
        { status: 404 }
      );
    }

    const dbMembers = await prisma.member.findMany({
      where: {
        familyId: family.id,
        isActive: true,
        source: { not: "BANKLOG_GHOST" },
      },
      select: {
        id: true,
        steamId: true,
        discordId: true,
        discordDisplayName: true,
        discordUsername: true,
        rankLabel: true,
        rankRoleId: true,
        discordRoleIds: true,
        discordLastError: true,
        grade: true,
        gradeLevel: true,
        rpName: true,
        playtime7d: true,
        playtime7dUpdatedAt: true,
        updatedAt: true,
        discordSnapshot: {
          select: {
            rolesJson: true,
            isInGuild: true,
          },
        },
      },
      take: 500,
      orderBy: [{ rpName: "asc" }],
    });

    const discordIds = Array.from(
      new Set(
        dbMembers
          .map((m) => m.discordId)
          .filter((discordId): discordId is string => Boolean(discordId))
      )
    );

    const avatarHashByDiscordId = new Map<string, string>();
    if (discordIds.length > 0) {
      const linkedAccounts = await prisma.account.findMany({
        where: {
          provider: "discord",
          providerAccountId: { in: discordIds },
        },
        select: {
          providerAccountId: true,
          user: {
            select: {
              image: true,
            },
          },
        },
      });

      for (const account of linkedAccounts) {
        const hash = extractDiscordAvatarHash(account.user?.image);
        if (hash) avatarHashByDiscordId.set(account.providerAccountId, hash);
      }
    }

    const normalized: MemberItem[] = dbMembers
      .filter((m) => m.steamId)
      .map((m) => {
        const stableRank = resolveStableRank({
          hasDiscordId: Boolean(m.discordId),
          rankRoleId: m.rankRoleId,
          rankLabel: m.rankLabel,
          discordRoleIds: m.discordRoleIds,
          snapshotRolesJson: m.discordSnapshot?.rolesJson,
          discordLastError: m.discordLastError,
        });

        const rankLabel = stableRank.rankRoleId
          ? getGradeBadgeProps(stableRank.rankRoleId).label
          : stableRank.rankLabel;

        return {
          id: m.id,
          steamId64: m.steamId ?? "",
          family: family.slug ?? null,
          rank: rankLabel ?? null,
          discordId: m.discordId ?? null,
          discordAvatarHash: m.discordId ? avatarHashByDiscordId.get(m.discordId) ?? null : null,
          discordStatus: !m.discordId
            ? ("NON_VERIFIE" as const)
            : m.discordSnapshot?.isInGuild === false
              ? ("HORS_DISCORD" as const)
              : ("OK" as const),
          rpName: getMemberDisplayName(m),
          grade: m.grade ?? null,
          gradeLevel: typeof m.gradeLevel === "number" ? m.gradeLevel : 0,
          playtime7d: m.playtime7d ?? 0,
          playtime7dUpdatedAt: m.playtime7dUpdatedAt?.toISOString() ?? null,
          updatedAt: m.updatedAt.toISOString(),
        };
      });

    // 🔍 Inline search filter
    const filtered = q
      ? normalized.filter((m) => {
          const needle = q.toLowerCase();
          return (
            m.steamId64.toLowerCase().includes(needle) ||
            (m.family ?? "").toLowerCase().includes(needle) ||
            (m.rank ?? "").toLowerCase().includes(needle) ||
            (m.rpName ?? "").toLowerCase().includes(needle) ||
            (m.grade ?? "").toLowerCase().includes(needle) ||
            (m.discordId ?? "").toLowerCase().includes(needle)
          );
        })
      : normalized;

    // Apply server-side sort
    const sorted = [...filtered].sort((a, b) => {
      const dir = sortDir === "desc" ? -1 : 1;
      switch (sortBy) {
        case "playtime7d":
          return dir * ((a.playtime7d ?? 0) - (b.playtime7d ?? 0));
        case "grade":
          return dir * ((a.gradeLevel ?? 0) - (b.gradeLevel ?? 0)) || (a.rpName ?? "").localeCompare(b.rpName ?? "");
        case "status": {
          // OK=0, HORS_DISCORD=1, NON_VERIFIE=2 — matches UI semantic order (best→worst)
          const order: Record<MemberItem["discordStatus"], number> = { OK: 0, HORS_DISCORD: 1, NON_VERIFIE: 2 };
          const diff = dir * (order[a.discordStatus] - order[b.discordStatus]);
          return diff !== 0 ? diff : (a.rpName ?? "").localeCompare(b.rpName ?? "");
        }
        case "name":
        default:
          return dir * (a.rpName ?? "").localeCompare(b.rpName ?? "");
      }
    });

    const items = sorted.slice(0, limit).map((m) => ({
      id: m.id,
      steamId64: m.steamId64,
      family: m.family ?? null,
      rank: m.rank ?? null,
      discordId: m.discordId ?? null,
      discordAvatarHash: m.discordAvatarHash ?? null,
      discordStatus: m.discordStatus,
      rpName: m.rpName ?? null,
      grade: m.grade ?? null,
      gradeLevel: typeof m.gradeLevel === "number" ? m.gradeLevel : 0,
      playtime7d: m.playtime7d ?? 0,
      playtime7dUpdatedAt: m.playtime7dUpdatedAt ?? null,
      updatedAt: m.updatedAt,
    }));

    const rows: StaffMemberDto[] = items.map((m) => ({
      id: m.id,
      rpName: m.rpName ?? null,
      steamId: m.steamId64 ?? null,
      discordId: m.discordId ?? null,
      discordAvatarHash: m.discordAvatarHash ?? null,
      familyName: m.family ?? null,
      currentGradeName: m.rank ?? m.grade ?? null,
      playtime7d: m.playtime7d ?? 0,
      playtime7dUpdatedAt: m.playtime7dUpdatedAt ?? null,
      updatedAt: m.updatedAt,
    }));

    return NextResponse.json({
      ok: true,
      familyId,
      total: items.length,
      items,
      members: items,
      rows,
      source: "db",
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
