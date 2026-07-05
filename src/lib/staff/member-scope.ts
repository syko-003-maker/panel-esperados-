import { BLACKLIST_ROLE_ID, getDiscordGrade, RESERVIST_ROLE_ID } from "@/lib/discord-grade";
import { DEMOTE_ROLE_ID } from "@/lib/discord-rbac";
import { CHEF_FAMILLE_ROLE_ID, SOUS_CHEF_FAMILLE_ROLE_ID } from "@/lib/discord-roles";
import { EXTRA_MEMBER_ROLE_IDS } from "@/lib/grade-colors";

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
  const isOutOfDiscord = hasDiscordId && member.discordInGuild === false;

  const isBlacklisted = roleSet.has(BLACKLIST_ROLE_ID) || statusHints.includes("blacklist");
  const isReservist =
    roleSet.has(RESERVIST_ROLE_ID) ||
    statusHints.includes("reserviste") ||
    statusHints.includes("reservist");

  // Out-of-discord counts as demoted only if not already in a priority category (blacklist/reservist)
  const isDemoted =
    roleSet.has(DEMOTE_ROLE_ID) ||
    statusHints.includes("demote") ||
    (isOutOfDiscord && !isBlacklisted && !isReservist);

  // Chef & Sous-Chef Famille : exclus du suivi playtime / sanctions
  const isChefExempt =
    (CHEF_FAMILLE_ROLE_ID && roleSet.has(CHEF_FAMILLE_ROLE_ID)) ||
    (SOUS_CHEF_FAMILLE_ROLE_ID && roleSet.has(SOUS_CHEF_FAMILLE_ROLE_ID)) ||
    statusHints.includes("chef");

  // "Extra members" (rôles type Nutella) : reconnus comme membres pour
  // /me, /bank, banklogs persos — mais EXCLUS du staff scope (pas dans
  // /staff/warns, /staff/meetings, /staff/sanctions, /staff/banklogs, etc.)
  // Pas de promotion grade non plus.
  const isExtraMember = EXTRA_MEMBER_ROLE_IDS.some((rid) => roleSet.has(rid));

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
    isExtraMember,
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

  // Nota : les "extra members" (Nutella, etc.) RESTENT displayable ici. On
  // veut les voir dans /staff/members et /staff/banklogs. L'exclusion des
  // workflows playtime/sanctions/warns/meetings se fait explicitement dans
  // les routes concernées via `flags.isExtraMember`.
  return true;
}

/**
 * Variante "métier" : actif + linké + PAS extra-member. À utiliser pour les
 * workflows playtime / sanctions / warns / meetings où les rôles "membre
 * basique" (Nutella, etc.) ne doivent pas apparaître. Pour les vues
 * d'inventaire générales (members list, banklogs staff), utiliser
 * `isActiveMembersScopeMember` qui les inclut.
 */
export function isStaffMeetingScopeMember(member: MemberScopeInput): boolean {
  if (!isActiveMembersScopeMember(member)) return false;
  const flags = getMemberScopeFlags(member);
  if (flags.isExtraMember) return false;
  // Démotés / blacklistés : hors périmètre réunion — ils ne sont plus dans la
  // hiérarchie active (pas de playtime/promotion/décision hebdo à leur sujet).
  if (flags.isBlacklisted || flags.isDemoted) return false;
  return true;
}

export function isNonLinkedDisplayableStaffMember(member: MemberScopeInput): boolean {
  return isDisplayableStaffMember(member) && !isLinkedStaffMember(member);
}

export function isActiveMembersScopeMember(member: MemberScopeInput): boolean {
  return isDisplayableStaffMember(member) && isLinkedStaffMember(member);
}

/**
 * Variante pour la page sanctions : on inclut les **réservistes** dans le
 * picker pour permettre l'escalade RESERVISTE → DEMOTE/BLACKLIST (cas
 * d'usage typique : un réserviste continue à mal se comporter, on doit
 * pouvoir le démoter sans devoir d'abord lui retirer le statut).
 *
 * Restent EXCLUS :
 *   - Blacklistés (déjà au plus bas, plus rien à escalader)
 *   - Démotés (sanction déjà appliquée, pas besoin d'apparaître ici —
 *     si on veut les blacklister, c'est plus une décision EM qu'une
 *     sanction quotidienne)
 *   - Extra-members (Nutella, etc.)
 *
 * La logique d'escalade est gérée côté POST /api/staff/sanctions.
 */
export function isSanctionableScopeMember(member: MemberScopeInput): boolean {
  if (!isLinkedStaffMember(member)) return false;
  const isActive = member.isActive === true;
  const isGhost = member.isGhost === true;
  const isMissingFromLyg = member.missingFromLygSince != null;
  if (!isActive || isGhost || isMissingFromLyg) return false;

  const flags = getMemberScopeFlags(member);
  // Réservistes : OK. Démotés / Blacklistés / Extra-members : exclus.
  if (flags.isBlacklisted || flags.isDemoted || flags.isExtraMember) return false;
  return true;
}
