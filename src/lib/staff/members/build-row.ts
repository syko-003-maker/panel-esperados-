/**
 * Construction d'un StaffMemberDto à partir d'un NormalizedMember.
 * Pure : prend un member normalisé + lookups (avatars, playtime history)
 * et retourne le DTO final renvoyé par /api/staff/members.
 *
 * Extrait de app/api/staff/members/route.ts (Lot 7).
 */

import type { StaffMemberDto } from "@/types/staff";
import { getMemberDisplayName } from "@/lib/member-display";
import type { NormalizedMember } from "./member-normalize";

export function buildStaffMemberRow(
  member: NormalizedMember,
  avatarHashByDiscordId: Map<string, string | null>,
  previousWeekMap: Map<string, number>
): StaffMemberDto {
  const playtime = typeof member.playtime7d === "number" ? member.playtime7d : 0;
  const previousPlaytime = previousWeekMap.get(member.id) ?? null;
  const delta = previousPlaytime == null ? null : playtime - previousPlaytime;
  const grade = member._discordGrade ?? null;

  // Le shape ci-dessous DOIT rester strictement identique à celui retourné
  // historiquement par /api/staff/members. Toute modification casse les clients
  // (members-list-client, dashboard, sidebar count).
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
    discordAvatarHash: member.discordId
      ? avatarHashByDiscordId.get(member.discordId) ?? null
      : null,
    discordRolesUpdatedAt: member.discordRolesUpdatedAt?.toISOString() ?? null,
    discordLastError: member.discordLastError ?? null,
    discordInGuild: member.discordInGuild ?? null,
    playtime7d: playtime,
    playtime7dUpdatedAt: member.playtime7dUpdatedAt?.toISOString() ?? null,
    updatedAt: new Date().toISOString(),
    previousPlaytime7d: previousPlaytime,
    playtimeDelta7d: delta,
    // Scope flags pour filtrage client-side (scope=everything)
    _isActive: member._isActive === true,
    _isDemoted: member._isDemoted === true,
    _isBlacklisted: member._isBlacklisted === true,
    _isReservist: member._isReservist === true,
    _isNonLink: member._isNonLink === true,
    _isOutOfDiscord: member._isOutOfDiscord === true,
  } as StaffMemberDto;
}
