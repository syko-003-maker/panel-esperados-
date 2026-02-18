import { debug, logger, warn } from "@/lib/logger";
import { getDiscordIdForSession } from "./discord";
import {
  CHEF_FAMILLE_ROLE_ID,
  ETAT_MAJOR_ROLE_ID,
  RECRUTEUR_ROLE_ID,
  getDiscordRolesForUser,
  hasAnyRole,
  logDiscordRoleConfig,
} from "@/lib/discord-roles";

export type Role = "member" | "staff" | "chef";

/**
 * Get user role based on Discord ID from allowlist OR Discord role
 * Source of truth: Account.providerAccountId (provider="discord")
 * 
 * ✅ ROBUST: Falls back to Discord API if allowlist incomplete
 * - CHEF_DISCORD_IDS / STAFF_DISCORD_IDS: Hardcoded allow lists
 * - CHEF_FAMILLE_ROLE_ID: Discord role verification (fallback)
 */
export async function getUserRole(session: any): Promise<Role> {
  // Handle missing session
  if (!session) {
    logger.warn("rbac", "getUserRole: no session");
    return "member";
  }

  // Get Discord ID from database (single source of truth)
  const discordId = await getDiscordIdForSession(session);

  if (!discordId) {
    logger.warn("rbac", "getUserRole: no discordId found");
    if (shouldLogRbac()) {
      warn("⚠️ RBAC WARNING: No Discord ID found for user", {
        userId: session.user?.id,
        hasSession: !!session,
      });
    }
    return "member";
  }

  logDiscordRoleConfig("getUserRole");

  const roles = await getDiscordRolesForUser(discordId);
  const isChefOrEtatMajor = hasAnyRole(roles, [CHEF_FAMILLE_ROLE_ID, ETAT_MAJOR_ROLE_ID]);
  if (isChefOrEtatMajor) {
    logger.debug("rbac", `getUserRole: ${discordId} => chef (discord role)`);
    if (shouldLogRbac()) {
      debug("✅ RBAC: User is CHEF (Discord role)", { discordId });
    }
    return "chef";
  }

  const isRecruiter = hasAnyRole(roles, [RECRUTEUR_ROLE_ID]);
  if (isRecruiter) {
    logger.debug("rbac", `getUserRole: ${discordId} => staff (recruiter)`);
    if (shouldLogRbac()) {
      debug("✅ RBAC: User is RECRUTEUR", { discordId });
    }
    return "staff";
  }

  logger.debug("rbac", `getUserRole: ${discordId} => member`);
  if (shouldLogRbac()) {
    debug("ℹ️ RBAC: User is MEMBER", { discordId });
  }
  return "member";
}

/**
 * Check if RBAC logging is enabled
 */
function shouldLogRbac(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.DEBUG_RBAC === "true"
  );
}

/**
 * Enforce role requirement (throws if insufficient permissions)
 */
export async function requireRole(
  session: any,
  minRole: Role
): Promise<void> {
  const role = await getUserRole(session);

  const hierarchy: Record<Role, number> = { member: 0, staff: 1, chef: 2 };
  const required = hierarchy[minRole];
  const actual = hierarchy[role];

  if (actual < required) {
    logger.warn(
      "rbac",
      `requireRole: insufficient role ${role} < ${minRole}`
    );
    throw new Error(`Insufficient permissions: require ${minRole}`);
  }
}
