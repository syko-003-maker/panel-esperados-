import { NextResponse } from "next/server";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { jsonError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { logError, logWarn } from "@/lib/obs";
import { getPreviousPlaytimeWeekStart } from "@/lib/playtime-insights";
import type { StaffMemberDto } from "@/types/staff";
import { ensureFreshFamilyPlaytime } from "@/lib/staff/ensure-fresh-playtime";
import { extractDiscordAvatarHash } from "@/lib/discord/getDiscordAvatarUrl";
import { getMemberDisplayName } from "@/lib/member-display";
import {
  getMemberScopeFlags,
  isActiveMembersScopeMember,
  isDisplayableStaffMember,
  isLinkedStaffMember,
  isNonLinkedDisplayableStaffMember,
} from "@/lib/staff/member-scope";
import { parseAbsenceMeta } from "@/lib/meetings";
import {
  BLACKLIST_ROLE_ID,
  getDiscordGradeLevel,
  getDiscordGradeRoleId,
  getDiscordGradeMappings,
  RESERVIST_ROLE_ID,
} from "@/lib/discord-grade";
import { DEMOTE_ROLE_ID } from "@/lib/discord-rbac";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

// ---------------------------------------------------------------------------
// Module-level cache for Discord avatar hashes fetched directly from Discord API.
// Persists across requests within the same Node.js process (1-hour TTL).
// This covers members who have never logged into the panel (no Account row).
// ---------------------------------------------------------------------------
const discordAvatarCache = new Map<string, { hash: string | null; fetchedAt: number }>();
const AVATAR_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour for real hashes
const AVATAR_NULL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes for null (retry sooner)

async function fetchDiscordAvatarHashBatch(
  discordIds: string[]
): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (!discordIds.length) return result;

  const botToken = (process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN ?? "").trim();

  // No guildId required: we use the /users/:id endpoint which works even for ex-guild members.
  if (!botToken) {
    for (const id of discordIds) result.set(id, null);
    return result;
  }

  const now = Date.now();
  const toFetch: string[] = [];

  for (const id of discordIds) {
    const cached = discordAvatarCache.get(id);
    if (cached) {
      const ttl = cached.hash ? AVATAR_CACHE_TTL_MS : AVATAR_NULL_CACHE_TTL_MS;
      if (now - cached.fetchedAt < ttl) {
        result.set(id, cached.hash);
        continue;
      }
    }
    toFetch.push(id);
  }

  // Fetch from Discord API with concurrency=3 to respect rate limits
  const CONCURRENCY = 3;
  for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
    const batch = toFetch.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(async (discordId) => {
        const res = await fetch(
           `https://discord.com/api/v10/users/${discordId}`,
          {
            headers: { Authorization: `Bot ${botToken}` },
            signal: AbortSignal.timeout(5000),
          }
        );
        if (!res.ok) return { discordId, hash: null as string | null };
         const user = (await res.json()) as { avatar?: string | null };
         return { discordId, hash: user.avatar ?? null };
      })
    );

    for (const s of settled) {
      if (s.status === "fulfilled") {
        const { discordId, hash } = s.value;
        discordAvatarCache.set(discordId, { hash, fetchedAt: now });
        result.set(discordId, hash);
      }
    }
  }

  for (const id of toFetch) {
    if (!result.has(id)) {
      discordAvatarCache.set(id, { hash: null, fetchedAt: now });
      result.set(id, null);
    }
  }

  return result;
}

function isMissingColumnError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as any).code === "P2022";
}

type MembersScope = "active" | "all" | "demoted" | "non_link" | "blacklisted" | "reservists";

type MembersSortBy = "name" | "grade" | "playtime7d" | "status";
type MembersSortDir = "asc" | "desc";

const MAX_SEARCH_LENGTH = 120;

const GRADE_LEVEL_BY_NAME = new Map(
  getDiscordGradeMappings().map((entry, index, arr) => [entry.grade.toLowerCase(), arr.length - index])
);

function parseScope(raw: string | null): MembersScope {
  if (raw === "all" || raw === "demoted" || raw === "non_link" || raw === "blacklisted" || raw === "reservists") return raw;
  return "active";
}

function parseSortBy(raw: string | null): MembersSortBy {
  if (raw === "grade" || raw === "playtime7d" || raw === "status") return raw;
  return "name";
}

function parseSortDir(raw: string | null): MembersSortDir {
  return raw === "desc" ? "desc" : "asc";
}

function parseLimit(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "200", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 200;
  }

  return Math.min(parsed, 500);
}

function sanitizeSearch(raw: string | null): string {
  return (raw ?? "").trim().slice(0, MAX_SEARCH_LENGTH);
}

function getRowStatus(row: StaffMemberDto): "active" | "demoted" | "blacklisted" | "non_link" | "reservist" {
  const grade = row.currentGradeName ?? "";
  if (grade === "Blacklist") return "blacklisted";
  if (grade === "Demote") return "demoted";
  if (grade === "Réserviste" || grade === "Reservist") return "reservist";
  if (!row.discordId) return "non_link";
  return "active";
}

function matchesSearch(row: StaffMemberDto, search: string): boolean {
  if (!search) return true;
  const needle = search.toLowerCase();
  return [row.rpName, row.steamId, row.discordId]
    .filter((value): value is string => typeof value === "string" && value.trim() !== "")
    .some((value) => value.toLowerCase().includes(needle));
}

function compareRows(a: StaffMemberDto, b: StaffMemberDto, sortBy: MembersSortBy, sortDir: MembersSortDir): number {
  const direction = sortDir === "desc" ? -1 : 1;

  switch (sortBy) {
    case "grade": {
      const levelA = GRADE_LEVEL_BY_NAME.get((a.currentGradeName ?? "").toLowerCase()) ?? -1;
      const levelB = GRADE_LEVEL_BY_NAME.get((b.currentGradeName ?? "").toLowerCase()) ?? -1;
      if (levelA !== levelB) return direction * (levelA - levelB);
      break;
    }
    case "playtime7d": {
      const playtimeA = typeof a.playtime7d === "number" ? a.playtime7d : 0;
      const playtimeB = typeof b.playtime7d === "number" ? b.playtime7d : 0;
      if (playtimeA !== playtimeB) return direction * (playtimeA - playtimeB);
      break;
    }
    case "status": {
      const order = { active: 0, blacklisted: 1, reservist: 2, demoted: 3, non_link: 4 } as const;
      const statusA = order[getRowStatus(a)];
      const statusB = order[getRowStatus(b)];
      if (statusA !== statusB) return direction * (statusA - statusB);
      break;
    }
    case "name":
    default:
      break;
  }

  return (a.rpName ?? "").localeCompare(b.rpName ?? "", "fr");
}

function getExclusionReason(params: {
  scope: MembersScope;
  isActiveMember: boolean;
  hasDiscordId: boolean;
  hasRoles: boolean;
  hasMappedGrade: boolean;
  isDemoted: boolean;
  isBlacklisted: boolean;
  isReservist: boolean;
}): string {
  const {
    scope,
    isActiveMember,
    hasDiscordId,
    hasRoles,
    hasMappedGrade,
    isDemoted,
    isBlacklisted,
    isReservist,
  } = params;

  if (!hasDiscordId) return "missing_discord_id";
  if (!hasRoles) return "missing_roles";
  if (!hasMappedGrade && !isDemoted) return "roles_not_mapped_to_grade";

  if (scope === "non_link" && hasDiscordId) return "has_discord_id_for_non_link_scope";
  if (scope === "blacklisted" && !isBlacklisted) return "not_blacklisted_for_blacklisted_scope";
  if (scope === "reservists" && !isReservist) return "not_reservist_for_reservists_scope";

  if (scope === "demoted" && !isDemoted) return "not_demoted_for_demoted_scope";
  if (scope === "all" && !isDemoted && !isBlacklisted && !isReservist && !isActiveMember) return "inactive_not_special_for_all_scope";
  if (scope === "active" && !isActiveMember) return "inactive_for_active_scope";
  if (scope === "active" && isDemoted) return "demoted_for_active_scope";
  if (scope === "active" && isBlacklisted) return "blacklisted_for_active_scope";
  if (scope === "active" && isReservist) return "reservist_for_active_scope";

  return "filtered_by_scope_rules";
}

export async function GET(req: Request) {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) {
    return guard;
  }

  try {
    const url = new URL(req.url);
    const familySlug = url.searchParams.get("familyId") ?? "esperados";
    const scope = parseScope(url.searchParams.get("scope"));
    const countOnly = url.searchParams.get("countOnly") === "1";
    const search = sanitizeSearch(url.searchParams.get("search") ?? url.searchParams.get("q"));
    const sortBy = parseSortBy(url.searchParams.get("sortBy"));
    const sortDir = parseSortDir(url.searchParams.get("sortDir"));
    const limit = parseLimit(url.searchParams.get("limit"));
    const includeInactive = scope !== "active";

    const family = await prisma.family.findUnique({
      where: { slug: familySlug },
      select: { id: true },
    });

    if (!family) {
      return jsonError(404, "FAMILY_NOT_FOUND", "Family not found", { rows: [] });
    }

    await ensureFreshFamilyPlaytime(familySlug);

    let members: any[];

    try {
      members = await prisma.member.findMany({
        where: {
          familyId: family.id,
          source: { not: "BANKLOG_GHOST" },
          ...(includeInactive ? {} : { isActive: true }),
        },
        orderBy: [{ rpName: "asc" }],
        select: {
          id: true,
          steamId: true,
          discordId: true,
          rpName: true,
          discordDisplayName: true,
          discordUsername: true,
          grade: true,
          isActive: true,
          isGhost: true,
          discordInGuild: true,
          missingFromLygSince: true,
          discordRoleIds: true,
          rankRoleId: true,
          rankLabel: true,
          discordLastError: true,
          discordRolesUpdatedAt: true,
          playtime7d: true,
          playtime7dUpdatedAt: true,
        } as any,
      } as any);
    } catch (error) {
      if (!isMissingColumnError(error)) {
        throw error;
      }

      logWarn("staff_members_missing_playtime_columns", {
        code: (error as any)?.code,
        familySlug,
      });

      members = await prisma.member.findMany({
        where: {
          familyId: family.id,
          source: { not: "BANKLOG_GHOST" },
          ...(includeInactive ? {} : { isActive: true }),
        },
        orderBy: [{ rpName: "asc" }],
        select: {
          id: true,
          steamId: true,
          discordId: true,
          rpName: true,
          discordDisplayName: true,
          discordUsername: true,
          grade: true,
          isActive: true,
          isGhost: true,
          discordInGuild: true,
          missingFromLygSince: true,
          discordRoleIds: true,
          rankRoleId: true,
          rankLabel: true,
          discordLastError: true,
          discordRolesUpdatedAt: true,
        } as any,
      } as any);
    }

    const normalizedMembers = members
      .map((member: any) => {
        const {
          discordRoleIds,
          hasDiscordId,
          hasRoles,
          hasDiscordGrade,
          gradeInfo,
          isDemoted,
          isBlacklisted,
          isReservist,
        } = getMemberScopeFlags(member);
        const isDisplayableMember = isDisplayableStaffMember(member);
        const isLinkedMember = isLinkedStaffMember(member);
        const isActiveMember = isActiveMembersScopeMember(member);

        if (scope === "non_link") {
          if (!isNonLinkedDisplayableStaffMember(member)) {
            return null;
          }

          const resolvedGrade = isBlacklisted
            ? "Blacklist"
            : isDemoted
              ? "Demote"
              : isReservist
                ? "Réserviste"
                : gradeInfo.grade;
          const resolvedRoleId = isBlacklisted
            ? BLACKLIST_ROLE_ID
            : isDemoted
              ? DEMOTE_ROLE_ID
              : isReservist
                ? RESERVIST_ROLE_ID
                : getDiscordGradeRoleId(discordRoleIds);
          const resolvedLevel = isDemoted || isBlacklisted || isReservist ? null : getDiscordGradeLevel(discordRoleIds);

          return {
            ...member,
            grade: resolvedGrade,
            _discordGrade: resolvedGrade,
            _discordGradeLevel: resolvedLevel,
            _discordGradeRoleId: resolvedRoleId,
          };
        }

        const includeByScope = scope === "demoted"
          ? isDemoted
          : scope === "blacklisted"
            ? isBlacklisted
          : scope === "reservists"
            ? isReservist
          : scope === "all"
             ? isDisplayableMember
            : isActiveMember;

        if (!includeByScope) {
          return null;
        }

        const resolvedGrade = isBlacklisted
          ? "Blacklist"
          : isDemoted
            ? "Demote"
            : isReservist
              ? "Réserviste"
              : gradeInfo.grade;
        const resolvedRoleId = isBlacklisted
          ? BLACKLIST_ROLE_ID
          : isDemoted
            ? DEMOTE_ROLE_ID
            : isReservist
              ? RESERVIST_ROLE_ID
              : getDiscordGradeRoleId(discordRoleIds);
        const resolvedLevel = isDemoted || isBlacklisted || isReservist ? null : getDiscordGradeLevel(discordRoleIds);

        return {
          ...member,
          grade: resolvedGrade,
          _displayName: getMemberDisplayName(member),
          _discordGrade: resolvedGrade,
          _discordGradeLevel: resolvedLevel,
          _discordGradeRoleId: resolvedRoleId,
        };
      })
      .filter((member): member is any => member !== null)
      .sort((a, b) => {
        const levelA = typeof a._discordGradeLevel === "number" ? a._discordGradeLevel : -1;
        const levelB = typeof b._discordGradeLevel === "number" ? b._discordGradeLevel : -1;
        if (levelA !== levelB) return levelB - levelA;

        const nameA = (a._displayName ?? "").toString();
        const nameB = (b._displayName ?? "").toString();
        return nameA.localeCompare(nameB, "fr");
      });

    if (countOnly) {
      return NextResponse.json({
        ok: true,
        familyId: familySlug,
        count: normalizedMembers.length,
      });
    }

    const memberIds = normalizedMembers.map((member: any) => member.id);
    const previousWeekStart = getPreviousPlaytimeWeekStart();
    const historyModel = (prisma as any).memberPlaytimeHistory;
    const historyModelAvailable = typeof historyModel?.findMany === "function";
    let analyticsAvailable = false;
    let historyReadFailed = false;
    const previousWeekMap = new Map<string, number>();

    if (historyModelAvailable && memberIds.length > 0) {
      try {
        const playtimeHistory = await historyModel.findMany({
          where: {
            memberId: { in: memberIds },
            weekStart: previousWeekStart,
          },
          select: {
            memberId: true,
            weekStart: true,
            playtime7d: true,
          },
        });

        for (const history of playtimeHistory as Array<{ memberId: string; weekStart: Date; playtime7d: number }>) {
          if (history.weekStart.getTime() === previousWeekStart.getTime()) {
            previousWeekMap.set(history.memberId, history.playtime7d);
          }
        }

        analyticsAvailable = true;
      } catch (error) {
        historyReadFailed = true;
        logWarn("staff_members_history_read_failed", {
          familySlug,
          details: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const discordIds = Array.from(
      new Set(
        normalizedMembers
          .map((member: any) => member.discordId)
          .filter((discordId: unknown) => typeof discordId === "string" && discordId.trim() !== "")
      )
    ) as string[];

    const avatarHashByDiscordId = new Map<string, string | null>();

    if (discordIds.length > 0) {
      // Primary source: Account.user.image (members who have logged into the panel)
      const accounts = await prisma.account.findMany({
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

      for (const account of accounts) {
        const hash = extractDiscordAvatarHash(account.user?.image);
        if (hash) {
          avatarHashByDiscordId.set(account.providerAccountId, hash);
        }
      }

      // Fallback: Discord API for members without an Account entry (never logged in)
      const discordIdsWithoutAvatar = discordIds.filter(
        (id) => !avatarHashByDiscordId.get(id)
      );

      if (discordIdsWithoutAvatar.length > 0) {
        const apiAvatars = await fetchDiscordAvatarHashBatch(discordIdsWithoutAvatar);
        for (const [discordId, hash] of apiAvatars) {
          if (hash) {
            avatarHashByDiscordId.set(discordId, hash);
          }
        }
      }
    }

    const rows: StaffMemberDto[] = normalizedMembers.map((member: any) => {
      const playtime = typeof member.playtime7d === "number" ? member.playtime7d : 0;
      const previousPlaytime = previousWeekMap.get(member.id) ?? null;
      const delta = previousPlaytime == null ? null : playtime - previousPlaytime;
      const grade = member._discordGrade ?? null;

      return {
        id: member.id,
        steamId: member.steamId ?? null,
        discordId: member.discordId ?? null,
        rpName: getMemberDisplayName(member),
        familyName: null,
        currentGradeName: grade,
        rankRoleId: member._discordGradeRoleId ?? member.rankRoleId ?? null,
        rankLabel: member._discordGrade ?? member.rankLabel ?? null,
        grade,
        gradeLevel: typeof member._discordGradeLevel === "number" ? member._discordGradeLevel : null,
        discordAvatarHash: member.discordId ? avatarHashByDiscordId.get(member.discordId) ?? null : null,
        discordRolesUpdatedAt: member.discordRolesUpdatedAt?.toISOString() ?? null,
        discordLastError: member.discordLastError ?? null,
        playtime7d: playtime,
        playtime7dUpdatedAt: member.playtime7dUpdatedAt?.toISOString() ?? null,
        updatedAt: new Date().toISOString(),
        previousPlaytime7d: previousPlaytime,
        playtimeDelta7d: delta,
      };
    });

    const now = new Date();
    const memberIdsForAbsence = rows.map((row) => row.id);
    const discordIdsForAbsence = rows
      .map((row) => row.discordId)
      .filter((value): value is string => typeof value === "string" && value.trim() !== "");

    const approvedActiveAbsences = (memberIdsForAbsence.length > 0 || discordIdsForAbsence.length > 0)
      ? await prisma.absence.findMany({
          where: {
            familyId: family.id,
            status: "APPROVED",
            startAt: { lte: now },
            endAt: { gte: now },
            OR: [
              ...(memberIdsForAbsence.length > 0 ? [{ memberId: { in: memberIdsForAbsence } }] : []),
              ...(discordIdsForAbsence.length > 0 ? [{ discordId: { in: discordIdsForAbsence } }] : []),
            ],
          },
          orderBy: [{ endAt: "asc" }, { createdAt: "desc" }],
          select: {
            id: true,
            memberId: true,
            discordId: true,
            reason: true,
            notes: true,
            startAt: true,
            endAt: true,
          },
        })
      : [];

    const activeAbsenceByMemberId = new Map<string, any>();
    const activeAbsenceByDiscordId = new Map<string, any>();
    for (const absence of approvedActiveAbsences) {
      const meta = parseAbsenceMeta(absence.notes);
      const payload = {
        id: absence.id,
        type: meta.type,
        meetingDate: meta.meetingDate,
        reason: absence.reason,
        startAt: absence.startAt.toISOString(),
        endAt: absence.endAt.toISOString(),
      };

      if (absence.memberId && !activeAbsenceByMemberId.has(absence.memberId)) {
        activeAbsenceByMemberId.set(absence.memberId, payload);
      }
      if (absence.discordId && !activeAbsenceByDiscordId.has(absence.discordId)) {
        activeAbsenceByDiscordId.set(absence.discordId, payload);
      }
    }

    for (const row of rows) {
      (row as any).activeAbsence =
        activeAbsenceByMemberId.get(row.id) ??
        (row.discordId ? activeAbsenceByDiscordId.get(row.discordId) ?? null : null);
    }

    const filteredRows = rows.filter((row) => matchesSearch(row, search));
    const sortedRows = filteredRows
      .map((row, index) => ({ row, index }))
      .sort((left, right) => {
        const result = compareRows(left.row, right.row, sortBy, sortDir);
        return result !== 0 ? result : left.index - right.index;
      })
      .map(({ row }) => row)
      .slice(0, limit);

    return NextResponse.json({
      ok: true,
      rows: sortedRows,
      meta: {
        scope,
        sortBy,
        sortDir,
        limit,
        search,
        analyticsAvailable,
        historyReadFailed,
        historyModelAvailable,
      },
    });
  } catch (error) {
    logError("staff_members_failed", { path: "/api/staff/members" }, error);
    return jsonError(500, "INTERNAL_ERROR", "Failed to load staff members", { rows: [] });
  }
}
