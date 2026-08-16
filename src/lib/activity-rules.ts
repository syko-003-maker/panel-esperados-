import { DEFAULT_ACTIVITY_CONFIG } from "@/lib/activity-config";
import { CHEF_FAMILLE_ROLE_ID, SOUS_CHEF_FAMILLE_ROLE_ID } from "@/lib/discord-roles";

export type ActivityFlag = "INACTIVE" | "LOW_PLAYTIME";
export type SuggestedAction = "NONE" | "WARN_ORAL" | "WARN_LIGHT" | "RECOMMEND_KICK";
export type ActivityRules = {
  inactivityDays: number;
  lowPlaytimeMin: number;
  lowPlaytimeMax: number;
};

export const ACTIVITY_RULES: ActivityRules = {
  inactivityDays: DEFAULT_ACTIVITY_CONFIG.inactivityDays,
  lowPlaytimeMin: DEFAULT_ACTIVITY_CONFIG.lowPlaytimeMin,
  lowPlaytimeMax: DEFAULT_ACTIVITY_CONFIG.lowPlaytimeMax,
};

type MemberLike = {
  isChef?: boolean | null;
  rank?: string | null;
  role?: string | null;
  grade?: string | null;
  familyRole?: string | null;
  group?: string | null;
  roles?: string[] | null;
  discordRoleIds?: string[] | null; // champ DB — utilisé pour l'exemption Chef/Sous-Chef
};

function valueContainsWl1(value: string) {
  return value.toLowerCase().includes("wl1");
}

export function isWl1Exempt(member: MemberLike | null | undefined): boolean {
  if (!member) return false;
  if (member.isChef) return true;

  // Exemption Chef Famille / Sous-Chef Famille via discordRoleIds (champ DB)
  const roleIds = Array.isArray(member.discordRoleIds) ? member.discordRoleIds : [];
  if (
    (CHEF_FAMILLE_ROLE_ID && roleIds.includes(CHEF_FAMILLE_ROLE_ID)) ||
    (SOUS_CHEF_FAMILLE_ROLE_ID && roleIds.includes(SOUS_CHEF_FAMILLE_ROLE_ID))
  ) {
    return true;
  }

  const candidates = [
    member.rank,
    member.role,
    member.grade,
    member.familyRole,
    member.group,
  ].filter(Boolean) as string[];

  if (Array.isArray(member.roles)) {
    candidates.push(...member.roles.filter(Boolean));
  }

  return candidates.some(valueContainsWl1);
}

export function isTemporarilyExempt(exemptUntilISO?: string | null) {
  if (!exemptUntilISO) return false;
  const parsed = new Date(exemptUntilISO);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() > Date.now();
}

export function computeFlags(input: {
  now: Date;
  lastSeenAt?: Date | null;
  playtimeMinutes?: number | null;
  exempt: boolean;
  rules?: ActivityRules;
}) {
  const rules = input.rules ?? ACTIVITY_RULES;
  const flags: ActivityFlag[] = [];
  const reasons: string[] = [];
  let suggestedAction: SuggestedAction = "NONE";
  let inactiveDays: number | null = null;

  if (input.exempt) {
    return { flags, suggestedAction, reasons, inactiveDays };
  }

  if (input.lastSeenAt && !Number.isNaN(input.lastSeenAt.getTime())) {
    const diffMs = input.now.getTime() - input.lastSeenAt.getTime();
    inactiveDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
    if (inactiveDays >= rules.inactivityDays) {
      flags.push("INACTIVE");
      suggestedAction = "RECOMMEND_KICK";
      reasons.push(`Inactif ${inactiveDays} jours`);
    }
  }

  if (typeof input.playtimeMinutes === "number" && Number.isFinite(input.playtimeMinutes)) {
    const playtime = Math.max(0, Math.floor(input.playtimeMinutes));
    const lowThreshold = playtime <= rules.lowPlaytimeMax && playtime >= rules.lowPlaytimeMin;
    const veryLow = playtime < rules.lowPlaytimeMin;
    if (lowThreshold || veryLow) {
      flags.push("LOW_PLAYTIME");
      if (suggestedAction !== "RECOMMEND_KICK") {
        suggestedAction = "WARN_ORAL";
      }
      reasons.push(`Playtime faible: ${playtime} min`);
    }
  }

  return { flags, suggestedAction, reasons, inactiveDays };
}
