/**
 * Normalisation d'un Member DB en NormalizedMember (avec scope flags +
 * grade résolu) + filtrage par scope.
 *
 * Pure : pas de Prisma, pas d'IO. Prend un member, retourne un normalized
 * ou null si le member doit être filtré pour ce scope.
 *
 * Extrait de app/api/staff/members/route.ts (Lot 7).
 */

import {
  getMemberScopeFlags,
  isActiveMembersScopeMember,
  isDisplayableStaffMember,
  isLinkedStaffMember,
  isNonLinkedDisplayableStaffMember,
} from "@/lib/staff/member-scope";
import {
  BLACKLIST_ROLE_ID,
  getDiscordGradeLevel,
  getDiscordGradeRoleId,
  RESERVIST_ROLE_ID,
} from "@/lib/discord-grade";
import { DEMOTE_ROLE_ID } from "@/lib/discord-rbac";
import { getMemberDisplayName } from "@/lib/member-display";
import type { MembersScope } from "./query-params";

export interface NormalizedMember {
  // Champs DB hérités du member original
  id: string;
  steamId: string | null;
  discordId: string | null;
  rpName: string | null;
  discordDisplayName?: string | null;
  discordUsername?: string | null;
  isActive?: boolean;
  isGhost?: boolean;
  discordInGuild?: boolean | null;
  discordRoleIds?: unknown;
  rankRoleId?: string | null;
  rankLabel?: string | null;
  discordLastError?: string | null;
  discordRolesUpdatedAt?: Date | null;
  playtime7d?: number;
  playtime7dUpdatedAt?: Date | null;
  // Resolved grade (overrides member.grade)
  grade: string | null;
  // Métadonnées calculées (préfixe `_`)
  _displayName: string;
  _discordGrade: string | null;
  _discordGradeLevel: number | null;
  _discordGradeRoleId: string | null;
  _isActive: boolean;
  _isDemoted: boolean;
  _isBlacklisted: boolean;
  _isReservist: boolean;
  _isNonLink: boolean;
  _isOutOfDiscord: boolean;
}

/**
 * Décide si un member doit être inclus pour le scope donné.
 * Pure : utilise uniquement les flags pré-calculés par getMemberScopeFlags.
 */
export function shouldIncludeForScope(
  scope: MembersScope,
  flags: {
    isActiveMember: boolean;
    isDisplayable: boolean;
    isDemoted: boolean;
    isBlacklisted: boolean;
    isReservist: boolean;
    isNonLink: boolean;
  }
): boolean {
  if (scope === "everything") {
    // Inclure tout ce qui appartient à AU MOINS une catégorie utile
    return (
      flags.isActiveMember ||
      flags.isDemoted ||
      flags.isBlacklisted ||
      flags.isReservist ||
      flags.isNonLink
    );
  }

  if (scope === "non_link") return flags.isNonLink;
  if (scope === "demoted") return flags.isDemoted;
  if (scope === "blacklisted") return flags.isBlacklisted;
  if (scope === "reservists") return flags.isReservist;

  if (scope === "all") {
    return flags.isDisplayable || flags.isDemoted || flags.isBlacklisted || flags.isReservist;
  }

  // scope === "active" (par défaut)
  return flags.isActiveMember;
}

/**
 * Normalise un member DB en NormalizedMember + applique le filtre scope.
 * Retourne null si filtré.
 */
export function normalizeMember(member: any, scope: MembersScope): NormalizedMember | null {
  const {
    discordRoleIds,
    gradeInfo,
    isDemoted,
    isBlacklisted,
    isReservist,
    isOutOfDiscord,
  } = getMemberScopeFlags(member);

  const isDisplayable = isDisplayableStaffMember(member);
  const isLinked = isLinkedStaffMember(member);
  const isActiveMember = isActiveMembersScopeMember(member);
  const isNonLink = isNonLinkedDisplayableStaffMember(member);
  // isLinked utilisé pour signaler la couverture des cas (variable lue par TS)
  void isLinked;

  const include = shouldIncludeForScope(scope, {
    isActiveMember,
    isDisplayable,
    isDemoted,
    isBlacklisted,
    isReservist,
    isNonLink,
  });
  if (!include) return null;

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
  const resolvedLevel =
    isDemoted || isBlacklisted || isReservist ? null : getDiscordGradeLevel(discordRoleIds);

  return {
    ...member,
    grade: resolvedGrade,
    _displayName: getMemberDisplayName(member),
    _discordGrade: resolvedGrade,
    _discordGradeLevel: resolvedLevel,
    _discordGradeRoleId: resolvedRoleId,
    _isActive: isActiveMember,
    _isDemoted: isDemoted,
    _isBlacklisted: isBlacklisted,
    _isReservist: isReservist,
    _isNonLink: isNonLink,
    _isOutOfDiscord: isOutOfDiscord,
  };
}

/**
 * Tri "intra-page" : par niveau de grade décroissant, puis par displayName FR.
 * Utilisé après normalization pour ordonner les rows avant build-row.
 */
export function sortNormalizedByGradeAndName(rows: NormalizedMember[]): NormalizedMember[] {
  return [...rows].sort((a, b) => {
    const levelA = typeof a._discordGradeLevel === "number" ? a._discordGradeLevel : -1;
    const levelB = typeof b._discordGradeLevel === "number" ? b._discordGradeLevel : -1;
    if (levelA !== levelB) return levelB - levelA;

    const nameA = (a._displayName ?? "").toString();
    const nameB = (b._displayName ?? "").toString();
    return nameA.localeCompare(nameB, "fr");
  });
}
