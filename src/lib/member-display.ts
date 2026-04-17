import { resolveRank } from "@/lib/discord-rank";
import { getGradeBadgeProps } from "@/lib/grade-colors";

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function shortSteamId(steamId: string | null | undefined): string | null {
  const normalized = asNonEmptyString(steamId);
  if (!normalized) return null;
  if (normalized.length <= 10) return normalized;
  return `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
}

function parseSnapshotRoles(rolesJson: unknown): string[] {
  if (!Array.isArray(rolesJson)) return [];
  return rolesJson.filter((roleId): roleId is string => typeof roleId === "string" && roleId.trim().length > 0);
}

export function getMemberDisplayName(member: {
  rpName?: string | null;
  discordDisplayName?: string | null;
  discordUsername?: string | null;
  discordId?: string | null;
  steamId?: string | null;
}): string {
  const rpName = asNonEmptyString(member.rpName);
  if (rpName) return rpName;

  const displayName = asNonEmptyString(member.discordDisplayName);
  if (displayName) return displayName;

  const username = asNonEmptyString(member.discordUsername);
  if (username) return username;

  const discordId = asNonEmptyString(member.discordId);
  if (discordId) return "Membre lié";

  return "Non lié";
}

export function resolveStableRank(member: {
  hasDiscordId?: boolean;
  rankRoleId?: string | null;
  rankLabel?: string | null;
  discordRoleIds?: string[] | null;
  snapshotRolesJson?: unknown;
  discordLastError?: string | null;
}): {
  rankRoleId: string | null;
  rankLabel: string | null;
  neutralState: "DISCORD_UNAVAILABLE" | "VERIFICATION_DIFFEREE" | null;
} {
  const roleIdsFromMember = Array.isArray(member.discordRoleIds) ? member.discordRoleIds : [];
  const roleIdsFromSnapshot = parseSnapshotRoles(member.snapshotRolesJson);

  const localRoleIds = roleIdsFromMember.length > 0 ? roleIdsFromMember : roleIdsFromSnapshot;
  const resolvedFromLocal = resolveRank(localRoleIds);

  if (resolvedFromLocal.rankRoleId || resolvedFromLocal.rankLabel) {
    return {
      rankRoleId: resolvedFromLocal.rankRoleId,
      rankLabel: resolvedFromLocal.rankLabel,
      neutralState: null,
    };
  }

  if (member.rankRoleId || member.rankLabel) {
    return {
      rankRoleId: member.rankRoleId ?? null,
      rankLabel: member.rankLabel ?? null,
      neutralState: null,
    };
  }

  if (member.hasDiscordId && asNonEmptyString(member.discordLastError)) {
    return {
      rankRoleId: null,
      rankLabel: null,
      neutralState: "DISCORD_UNAVAILABLE",
    };
  }

  if (member.hasDiscordId) {
    return {
      rankRoleId: null,
      rankLabel: null,
      neutralState: "VERIFICATION_DIFFEREE",
    };
  }

  return {
    rankRoleId: null,
    rankLabel: null,
    neutralState: null,
  };
}

export function getNeutralRankBadge(state: "DISCORD_UNAVAILABLE" | "VERIFICATION_DIFFEREE") {
  if (state === "DISCORD_UNAVAILABLE") {
    const props = getGradeBadgeProps(null, "FETCH_FAILED");
    return { ...props, label: "Discord indisponible" };
  }

  const props = getGradeBadgeProps(null, "FETCH_FAILED");
  return { ...props, label: "Verification differee" };
}
