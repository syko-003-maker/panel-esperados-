/**
 * Batch member rank enrichment from Discord roles
 * Used by /staff/members page to fetch and resolve ranks for live display
 */
import { getGuildMembersMap } from "@/lib/discord-roles";
import { resolveRank, getRankGradeLevel } from "@/lib/discord-rank";
import { warn } from "@/lib/logger";

export type MemberForEnrichment = {
  id: string;
  discordId: string | null;
  rankLabel: string | null;
  rankRoleId?: string | null;
  [key: string]: unknown;
};

export type MemberWithDiagnostics = MemberForEnrichment & {
  _diag_hasDiscordId: boolean;
  _diag_discordId: string | null;
  _diag_fetchStatus: "OK" | "NOT_IN_GUILD" | "NO_DISCORD_ID" | "FETCH_FAILED" | "ALREADY_IN_DB";
  _diag_rolesCount: number;
  _diag_matchedRankRoleId: string | null;
  _diag_matchedRankLabel: string | null;
};

/**
 * Resolve rank with detailed diagnostics why it may have failed
 * 
 * Returns { rankRoleId, rankLabel } along with debug info
 */
function resolveRankWithDiagnostics(roles: string[]): {
  rankRoleId: string | null;
  rankLabel: string | null;
  matchedRoleId: string | null;
  reason: string;
} {
  if (!roles || roles.length === 0) {
    return {
      rankRoleId: null,
      rankLabel: null,
      matchedRoleId: null,
      reason: "No roles in Discord",
    };
  }

  const resolved = resolveRank(roles);
  if (resolved.rankLabel) {
    return {
      ...resolved,
      matchedRoleId: resolved.rankRoleId,
      reason: "Matched rank role",
    };
  }

  // Member has roles but none are rank roles
  return {
    rankRoleId: null,
    rankLabel: null,
    matchedRoleId: null,
    reason: `${roles.length} roles but no rank match (has staff/helper/access roles only)`,
  };
}

/**
 * Batch enrich members with Discord ranks + diagnostics
 *
 * For each member:
 * - If rankLabel already set in DB -> use it (skip Discord fetch)
 * - If discordId available -> fetch Discord roles and resolve rank
 * - If fetch/resolve fails -> rankLabel stays null (displays "—")
 * - Always include diagnostic fields for debugging
 *
 * Uses getDiscordRolesForUser which has built-in caching and deduplication.
 * Fetches all roles in parallel, so 10 members = 1 batch, not 10 calls.
 *
 * Handles errors gracefully - won't fail the page if Discord API unavailable
 *
 * @param members - Array of members from DB findMany()
 * @param options - Optional { guildId?, debug? }
 * @returns Members with rankLabel enriched from live Discord data (if needed) + diagnostics
 */
export async function enrichMembersWithRanks<T extends MemberForEnrichment>(
  members: T[],
  options?: { guildId?: string; debug?: boolean }
): Promise<(T & MemberWithDiagnostics)[]> {
  if (!members || members.length === 0) {
    return [];
  }

  const debug = options?.debug ?? false;
  const guildId = options?.guildId;

  // Identify members that need rank resolution
  // (have discordId but rankLabel not cached in DB)
  const needsResolution = members.filter((m) => m.discordId && !m.rankLabel);
  const alreadyInDb = members.filter((m) => m.rankLabel);

  if (debug) {
    console.log(
      `[discord-rank:batch] Processing ${members.length} members: ${alreadyInDb.length} in DB, ${needsResolution.length} need resolution`
    );
  }

  // Fetch all guild members once (with 60s cache)
  // This returns a Map<discordId, roleIds[]> or null if API fails
  let guildMembersMap: Map<string, string[]> | null = null;
  const hasDiscordMembersToCheck = needsResolution.length > 0;
  
  if (hasDiscordMembersToCheck) {
    try {
      if (debug) {
        console.log(`[discord-rank:batch] Fetching all guild members...`);
      }
      guildMembersMap = await getGuildMembersMap(guildId);
      
      if (guildMembersMap) {
        if (debug) {
          console.log(`[discord-rank:batch] Guild members map ready: ${guildMembersMap.size} members`);
        }
      } else {
        warn("[discord-rank:batch] Guild members map is null - Discord API error or unavailable");
      }
    } catch (err) {
      console.error("[discord-rank:batch] Failed to fetch guild members map:", err);
      // Continue gracefully - guildMembersMap will be null, all members will get FETCH_FAILED
    }
  }

  // Enrich all members with diagnostics
  const enriched: (T & MemberWithDiagnostics)[] = members.map((member) => {
    const hasDiscordId = Boolean(member.discordId);

    // Case 1: Already in DB
    if (member.rankLabel) {
      const gradeLevel = getRankGradeLevel(member.rankLabel);
      return {
        ...member,
        gradeLevel: gradeLevel || member.gradeLevel, // Ensure gradeLevel matches rankLabel
        _diag_hasDiscordId: hasDiscordId,
        _diag_discordId: member.discordId || null,
        _diag_fetchStatus: "ALREADY_IN_DB",
        _diag_rolesCount: 0,
        _diag_matchedRankRoleId: member.rankRoleId || null,
        _diag_matchedRankLabel: member.rankLabel,
      } as T & MemberWithDiagnostics;
    }

    // Case 2: No Discord ID
    if (!hasDiscordId) {
      return {
        ...member,
        _diag_hasDiscordId: false,
        _diag_discordId: null,
        _diag_fetchStatus: "NO_DISCORD_ID",
        _diag_rolesCount: 0,
        _diag_matchedRankRoleId: null,
        _diag_matchedRankLabel: null,
      } as T & MemberWithDiagnostics;
    }

    // Case 3: Discord ID exists, check guild members map
    // Map will be null if Discord API failed (429, 5xx, timeout, etc.)
    if (!guildMembersMap) {
      // Guild members fetch failed - mark as FETCH_FAILED (not NOT_IN_GUILD)
      return {
        ...member,
        _diag_hasDiscordId: true,
        _diag_discordId: member.discordId,
        _diag_fetchStatus: "FETCH_FAILED",
        _diag_rolesCount: 0,
        _diag_matchedRankRoleId: null,
        _diag_matchedRankLabel: null,
      } as T & MemberWithDiagnostics;
    }

    // Case 4: Guild members map is available, check if member is in guild
    const rolesFromGuild = guildMembersMap.get(member.discordId!);
    
    if (!rolesFromGuild) {
      // Member's discordId is NOT in the guild
      return {
        ...member,
        _diag_hasDiscordId: true,
        _diag_discordId: member.discordId,
        _diag_fetchStatus: "NOT_IN_GUILD",
        _diag_rolesCount: 0,
        _diag_matchedRankRoleId: null,
        _diag_matchedRankLabel: null,
      } as T & MemberWithDiagnostics;
    }

    // Case 5: Member is in guild, resolve rank from their roles
    const { rankRoleId, rankLabel, reason } = resolveRankWithDiagnostics(rolesFromGuild);
    
    // Calculate gradeLevel based on resolved rankLabel
    const newRankLabel = rankLabel || member.rankLabel;
    const gradeLevel = getRankGradeLevel(newRankLabel);

    const enrichedMember: T & MemberWithDiagnostics = {
      ...member,
      rankLabel: newRankLabel,
      rankRoleId: rankRoleId || member.rankRoleId,
      gradeLevel: gradeLevel || member.gradeLevel, // Update gradeLevel if rank changed
      _diag_hasDiscordId: true,
      _diag_discordId: member.discordId,
      _diag_fetchStatus: "OK",
      _diag_rolesCount: rolesFromGuild.length,
      _diag_matchedRankRoleId: rankRoleId,
      _diag_matchedRankLabel: rankLabel,
    } as T & MemberWithDiagnostics;

    if (debug) {
      console.debug(
        `[discord-rank:batch] ${member.discordId}: ${rolesFromGuild.length} roles → rank="${rankLabel ?? "—"}" gradeLevel=${gradeLevel} (${reason})`
      );
    }

    return enrichedMember;
  });

  if (debug) {
    const stats = {
      total: enriched.length,
      alreadyInDb: enriched.filter(
        (m) => m._diag_fetchStatus === "ALREADY_IN_DB"
      ).length,
      withRank: enriched.filter((m) => m._diag_matchedRankLabel).length,
      noDiscordId: enriched.filter((m) => m._diag_fetchStatus === "NO_DISCORD_ID")
        .length,
      fetchFailed: enriched.filter((m) => m._diag_fetchStatus === "FETCH_FAILED")
        .length,
      notInGuild: enriched.filter((m) => m._diag_fetchStatus === "NOT_IN_GUILD")
        .length,
    };
    console.log("[discord-rank:batch] Results:", stats);
  }

  return enriched;
}
