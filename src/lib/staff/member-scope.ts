import { BLACKLIST_ROLE_ID, getDiscordGrade, RESERVIST_ROLE_ID } from "@/lib/discord-grade";
import { DEMOTE_ROLE_ID } from "@/lib/discord-rbac";
import { CHEF_FAMILLE_ROLE_ID, SOUS_CHEF_FAMILLE_ROLE_ID } from "@/lib/discord-roles";

type MemberScopeInput = {
  discordId?: string | null;
  isActive?: boolean | null;
  isGhost?: boolean | null;
  discordInGuild?: boolean | null;
  missingFromLygSince?: Date | string | null;
  grade?: string | null;
  rankRoleId?: string | null;
  rankLabel?: string | null;
  discordRoleIds?: unknown;
};

function normalizeRoles(roles: unknown): string[] {
  if (Array.isArray(roles)) {
    return roles.map((role) => String(role ?? "").trim()).filter(Boolean);
  }

  if (typeof roles === "string") {
    const trimmed = roles.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((role) => String(role ?? "").trim()).filter(Boolean);
      }
    } catch {
      // Accept legacy serialized role formats.
    }

    return trimmed
      .split(/[\s,;|]+/)
      .map((role) => role.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeStatusText(value: string | null | undefined): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function getMemberScopeFlags(member: MemberScopeInput) {
  const discordId = String(member.discordId ?? "").trim();
  const discordRoleIds = normalizeRoles(member.discordRoleIds);
  const gradeInfo = getDiscordGrade(discordRoleIds);

  const hasDiscordId = discordId.length > 0;
  const hasRoles = discordRoleIds.length > 0;

  const statusHints = [member.grade, member.rankLabel, member.rankRoleId]
    .map((value) => normalizeStatusText(value))
    .join(" ");
  const roleSet = new Set(discordRoleIds);

  // Member has a Discord ID but the bot confirmed they are no longer in the guild
  // → treated as demoted (left the family)
  const isOutOfDiscord = hasDiscordId && member.discordInGuild === false;

  const isDemoted = roleSet.has(DEMOTE_ROLE_ID) || statusHints.includes("demote") || isOutOfDiscord;
  const isBlacklisted = roleSet.has(BLACKLIST_ROLE_ID) || statusHints.includes("blacklist");
  const isReservist =
    roleSet.has(RESERVIST_ROLE_ID) ||
    statusHints.includes("reserviste") ||
    statusHints.includes("reservist");
  // Chef & Sous-Chef Famille : exclus du suivi playtime / sanctions
  const isChefExempt =
    (CHEF_FAMILLE_ROLE_ID && roleSet.has(CHEF_FAMILLE_ROLE_ID)) ||
    (SOUS_CHEF_FAMILLE_ROLE_ID && roleSet.has(SOUS_CHEF_FAMILLE_ROLE_ID)) ||
    statusHints.includes("chef");

  const hasDiscordGrade = Boolean(gradeInfo.grade);

  return {
    discordRoleIds,
    hasDiscordId,
    hasRoles,
    hasDiscordGrade,
    gradeInfo,
    isDemoted,
    isBlacklisted,
    isReservist,
    isChefExempt,
    isOutOfDiscord,
  };
}

export function isLinkedStaffMember(member: MemberScopeInput): boolean {
  return getMemberScopeFlags(member).hasDiscordId;
}

export function isDisplayableStaffMember(member: MemberScopeInput): boolean {
  const flags = getMemberScopeFlags(member);
  const isActive = member.isActive === true;
  const isGhost = member.isGhost === true;
  const isMissingFromLyg = member.missingFromLygSince != null;

  if (!isActive) return false;
  if (isGhost) return false;
  if (isMissingFromLyg) return false;
  // isDemoted already includes isOutOfDiscord → they fall into the demote scope
  if (flags.isDemoted || flags.isBlacklisted || flags.isReservist) return false;

  return true;
}

export function isNonLinkedDisplayableStaffMember(member: MemberScopeInput): boolean {
  return isDisplayableStaffMember(member) && !isLinkedStaffMember(member);
}

export function isActiveMembersScopeMember(member: MemberScopeInput): boolean {
  return isDisplayableStaffMember(member) && isLinkedStaffMember(member);
}
