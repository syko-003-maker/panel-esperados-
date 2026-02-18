/**
 * Discord Rank Resolution
 * Maps Discord role IDs to rank labels and grade colors
 */

import { 
  resolveMemberGradeRoleId, 
  GRADE_LABEL_BY_ROLE_ID,
  getGradeLevelNumber,
  getGradeBadgeProps,
} from "@/lib/grade-colors";

export type RankInfo = {
  rankRoleId: string | null;
  rankLabel: string | null;
};

/**
 * Resolve rank from Discord role IDs
 * 
 * Takes a list of Discord role IDs and returns the rank (if any)
 * Follows the grade hierarchy: Chef famille → Général → ... → Réserviste
 * Returns the highest priority grade the user has
 * 
 * @param roleIds - List of Discord role IDs
 * @returns { rankRoleId, rankLabel } or { null, null } if no rank found
 */
export function resolveRank(roleIds: string[] | null | undefined): RankInfo {
  if (!roleIds || !Array.isArray(roleIds) || roleIds.length === 0) {
    return { rankRoleId: null, rankLabel: null };
  }

  // Use grade-colors system to find highest priority grade
  const gradeRoleId = resolveMemberGradeRoleId(roleIds);
  
  if (!gradeRoleId) {
    return { rankRoleId: null, rankLabel: null };
  }

  return {
    rankRoleId: gradeRoleId,
    rankLabel: GRADE_LABEL_BY_ROLE_ID[gradeRoleId] || null,
  };
}

/**
 * Get all available rank role IDs
 */
export function getRankRoleIds(): string[] {
  return Object.keys(GRADE_LABEL_BY_ROLE_ID);
}

/**
 * Check if role ID is a rank role
 */
export function isRankRole(roleId: string): boolean {
  return roleId in GRADE_LABEL_BY_ROLE_ID;
}

/**
 * Get label for rank role ID
 */
export function getRankLabel(roleId: string): string | null {
  return GRADE_LABEL_BY_ROLE_ID[roleId] ?? null;
}

/**
 * Get badge properties for a rank role ID
 * 
 * Returns label and Tailwind classes for displaying a badge
 * 
 * @param rankRoleId - Discord role ID
 * @returns { label: string, className: string }
 */
export function getRankBadgeProps(rankRoleId: string | null): { label: string; className: string } {
  if (!rankRoleId) {
    return getGradeBadgeProps(null);
  }

  return getGradeBadgeProps(rankRoleId);
}

/**
 * Get grade level from rank label/roleId
 * 
 * Maps Discord rank/roleId to numeric levels for sorting
 * Higher numbers appear first when sorting by gradeLevel DESC
 * 
 * @param rankLabel - Rank label (e.g., "Chef famille", "Général")
 * @param rankRoleId - Optional: role ID for more precise lookup
 * @returns Grade level for sorting (higher = more senior)
 */
export function getRankGradeLevel(rankLabel: string | null, rankRoleId?: string | null): number {
  if (!rankLabel && !rankRoleId) return 0;
  
  // Use roleId if provided (more reliable)
  if (rankRoleId) {
    return getGradeLevelNumber(rankRoleId);
  }

  // Fallback: try to find by label (slower)
  if (rankLabel) {
    for (const [roleId, label] of Object.entries(GRADE_LABEL_BY_ROLE_ID)) {
      if (label === rankLabel) {
        return getGradeLevelNumber(roleId);
      }
    }
  }

  return 0;
}

/**
 * Resolve rank for a Discord user by fetching their roles
 * 
 * Fetches the user's Discord roles and resolves to rank (if any)
 * Gracefully handles missing config or API errors
 * 
 * @param discordId - Discord user ID
 * @param guildId - Optional Discord guild ID
 * @returns { rankRoleId, rankLabel } or { null, null } if no rank or fetch fails
 */
export async function resolveRankFromDiscord(
  discordId?: string | null,
  guildId?: string
): Promise<RankInfo> {
  if (!discordId) {
    return { rankRoleId: null, rankLabel: null };
  }

  try {
    const { getDiscordRolesForUser } = await import("@/lib/discord-roles");
    const roles = await getDiscordRolesForUser(discordId, guildId);
    return resolveRank(roles);
  } catch (err) {
    // Silently fail - rank resolution shouldn't break member operations
    console.debug(`[discord-rank] Failed to resolve rank for discord ${discordId}:`, err);
    return { rankRoleId: null, rankLabel: null };
  }
}