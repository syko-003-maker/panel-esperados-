/**
 * Discord RBAC configuration for staff roles
 * 
 * Handles parsing of DISCORD_STAFF_ROLE_IDS environment variable
 * with fallback to individual DISCORD_STAFF_ROLE_ID for compatibility
 */

import { debug, error as logError } from "./logger";

const ROLE_ID_REGEX = /^[0-9]{17,20}$/;

interface StaffRoleConfig {
  roleIds: string[];
  source: "DISCORD_STAFF_ROLE_IDS" | "DISCORD_STAFF_ROLE_ID" | "DEFAULTS" | "NONE";
  isConfigured: boolean;
}

// Default staff role IDs (from Discord)
const DEFAULT_STAFF_ROLE_IDS = [
  "1429607761720770623", // Chef Famille
  "1312845999366209683", // Etat-Major
];

/**
 * Parse DISCORD_STAFF_ROLE_IDS environment variable
 * Format: "1429607761720770623,1312845999366209683"
 */
function parseStaffRoleIds(): string[] {
  // Priority 1: DISCORD_STAFF_ROLE_IDS (new format, comma-separated)
  const envMultiple = process.env.DISCORD_STAFF_ROLE_IDS?.trim();
  if (envMultiple) {
    const ids = envMultiple
      .split(",")
      .map(id => id.trim())
      .filter(id => ROLE_ID_REGEX.test(id));
    
    if (ids.length > 0) {
      return ids;
    }
    
    if (process.env.NODE_ENV !== 'production') {
      logError(
        "[discord-rbac] DISCORD_STAFF_ROLE_IDS set but no valid IDs found:",
        envMultiple
      );
    }
  }

  // Priority 2: DISCORD_STAFF_ROLE_ID (legacy format, single ID)
  const envSingle = process.env.DISCORD_STAFF_ROLE_ID?.trim();
  if (envSingle && ROLE_ID_REGEX.test(envSingle)) {
    return [envSingle];
  }
  
  if (envSingle && process.env.NODE_ENV !== 'production') {
    logError(
      "[discord-rbac] DISCORD_STAFF_ROLE_ID set but invalid format:",
      envSingle
    );
  }

  // Priority 3: Use defaults
  return DEFAULT_STAFF_ROLE_IDS;
}

/**
 * Get staff role configuration
 */
export function getStaffRoleConfig(): StaffRoleConfig {
  const envMultiple = process.env.DISCORD_STAFF_ROLE_IDS?.trim();
  const envSingle = process.env.DISCORD_STAFF_ROLE_ID?.trim();
  
  const roleIds = parseStaffRoleIds();
  
  let source: StaffRoleConfig["source"] = "NONE";
  if (envMultiple && roleIds.length > 0) {
    source = "DISCORD_STAFF_ROLE_IDS";
  } else if (envSingle && roleIds.length > 0) {
    source = "DISCORD_STAFF_ROLE_ID";
  } else if (roleIds.length > 0) {
    source = "DEFAULTS";
  }

  return {
    roleIds,
    source,
    isConfigured: roleIds.length > 0,
  };
}

/**
 * Get staff role IDs for role checking
 */
export function getStaffRoleIds(): string[] {
  return getStaffRoleConfig().roleIds;
}

/**
 * Check if a user has at least one staff role
 * @param userRoleIds User's Discord role IDs
 * @returns true if user has any staff role
 */
export function hasStaffRole(userRoleIds: string[]): boolean {
  const staffRoleIds = getStaffRoleIds();
  if (staffRoleIds.length === 0) return false;
  
  return userRoleIds.some(id => staffRoleIds.includes(id));
}

/**
 * Format role IDs for logging (last 4 digits only)
 */
export function formatRoleIdForLog(roleId: string): string {
  return roleId.slice(-4);
}

/**
 * Get formatted summary of configured staff roles
 */
export function getStaffRolesSummary(): string {
  const config = getStaffRoleConfig();
  
  if (!config.isConfigured) {
    return "No staff roles configured";
  }

  const formatted = config.roleIds.map(formatRoleIdForLog).join(", ");
  return `${config.roleIds.length} staff role(s) configured: ...${formatted} (from ${config.source})`;
}

/**
 * Log staff roles configuration at startup
 */
export function logStaffRolesConfig(): void {
  const summary = getStaffRolesSummary();
  if (process.env.NODE_ENV === 'production') {
    console.log(`[discord-rbac] RBAC ${summary}`);
  } else {
    debug("[discord-rbac] RBAC startup config", getStaffRoleConfig());
  }
}
