/**
 * Discord Role Configuration
 * Maps grades to Discord role IDs
 */

// Grade to Discord Role ID mapping
// Configure these via environment variables
export const GRADE_TO_ROLE: Record<string, string> = {
  WL1: process.env.DISCORD_ROLE_WL1 ?? "",
  WL2: process.env.DISCORD_ROLE_WL2 ?? "",
  WL3: process.env.DISCORD_ROLE_WL3 ?? "",
  WL4: process.env.DISCORD_ROLE_WL4 ?? "",
  OFFICER: process.env.DISCORD_ROLE_OFFICER ?? "",
  CAPTAIN: process.env.DISCORD_ROLE_CAPTAIN ?? "",
  CHEF: process.env.DISCORD_ROLE_CHEF ?? "",
};

// Developer override role (optional)
// If set, allows developer-level access to staff panel
export const DEVELOPER_ROLE_ID = process.env.DEVELOPER_ROLE_ID ?? "";

// All role IDs managed by the system (will be added/removed during sync)
export const MANAGED_ROLE_IDS: string[] = Object.values(GRADE_TO_ROLE).filter(Boolean);

// Protected role IDs (never removed even if in MANAGED_ROLE_IDS)
export const PROTECTED_ROLE_IDS: string[] = (process.env.DISCORD_PROTECTED_ROLES ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Get the Discord role ID for a grade
 */
export function getRoleIdForGrade(grade: string | null): string | null {
  if (!grade) return null;
  return GRADE_TO_ROLE[grade.toUpperCase()] || null;
}

/**
 * Check if a role ID is managed by the system
 */
export function isManagedRole(roleId: string): boolean {
  return MANAGED_ROLE_IDS.includes(roleId);
}

/**
 * Check if a role ID is protected
 */
export function isProtectedRole(roleId: string): boolean {
  return PROTECTED_ROLE_IDS.includes(roleId);
}

/**
 * Get all managed role IDs that are not protected
 */
export function getRemovableRoleIds(): string[] {
  return MANAGED_ROLE_IDS.filter((id) => !isProtectedRole(id));
}

/**
 * Get role configuration for API response
 */
export function getRoleConfig() {
  return {
    gradeToRole: GRADE_TO_ROLE,
    managedRoleIds: MANAGED_ROLE_IDS,
    protectedRoleIds: PROTECTED_ROLE_IDS,
  };
}
