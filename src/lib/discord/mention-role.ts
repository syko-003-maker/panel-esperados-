/**
 * Safe Discord Role Mention Helper
 * 
 * ✅ MEGA PATCH #3: Prevent "@rôle inconnu" errors
 * 
 * This module provides safe functions to construct Discord role mentions
 * with validation to ensure roleIds are in the correct format.
 */

/**
 * Validates if a string is a valid Discord role ID
 * Discord IDs are typically 18-20 digit snowflakes
 */
export function isValidDiscordRoleId(roleId: unknown): boolean {
  if (typeof roleId !== "string") return false;
  // Discord snowflakes are 18-20 digits
  return /^\d{17,20}$/.test(roleId);
}

/**
 * Safely construct a Discord role mention
 * Returns the mention format `<@&roleId>` if valid, null otherwise
 * 
 * @param roleId The Discord role ID to mention
 * @returns The mention string `<@&roleId>` or null if invalid
 */
export function mentionRole(roleId: unknown): string | null {
  if (!isValidDiscordRoleId(roleId)) {
    console.warn(
      `[mention-role] Invalid roleId: ${roleId}, type: ${typeof roleId}`
    );
    return null;
  }
  return `<@&${roleId}>`;
}

/**
 * Safely construct multiple role mentions
 * Filters out invalid role IDs and returns only valid mentions
 * 
 * @param roleIds Array of Discord role IDs
 * @returns Array of valid mention strings
 */
export function mentionRoles(roleIds: unknown[]): string[] {
  return roleIds
    .map((roleId) => mentionRole(roleId))
    .filter((mention): mention is string => mention !== null);
}

/**
 * Safely construct multiple role mentions as a space-separated string
 * 
 * @param roleIds Array of Discord role IDs
 * @returns Space-separated mention string, or empty string if no valid IDs
 */
export function mentionRolesString(roleIds: unknown[]): string {
  return mentionRoles(roleIds).join(" ");
}
