import type { Guild } from "discord.js";

const ROLE_ID_REGEX = /^[0-9]{17,20}$/;

export function safeRoleMention(
  guild: Guild | null,
  roleId?: string,
  fallbackName: string = "rôle"
): string {
  if (!roleId || !ROLE_ID_REGEX.test(roleId)) {
    return fallbackName;
  }

  if (!guild) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[discord] guild not available for role mention", { roleId });
    }
    return fallbackName;
  }

  const role = guild.roles.cache.get(roleId);
  if (role) return role.toString();

  if (process.env.NODE_ENV !== "production") {
    console.warn("[discord] roleId not found in guild cache", { roleId });
  }
  return fallbackName || `role:${roleId}`;
}
