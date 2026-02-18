/**
 * Discord Grades/Ranks Utility
 * 
 * Manages the 15 managed Discord rank roles.
 * Each member has AT MOST 1 grade role.
 * "Recruteur" is NOT a grade, it's just an access role.
 */

// ==================== CONSTANTS ====================

/**
 * The 15 managed grade role IDs (ordered by rank)
 * Index 0 = highest rank (Général)
 * Index 14 = lowest rank (Réserviste)
 */
export const GRADE_ROLE_IDS = [
  "1312845999739375710", // 0: Général
  "1312845999366209686", // 1: Consejero
  "1312845999366209685", // 2: Comandante
  "1312845999366209684", // 3: Coronel
  "1408485173527445627", // 4: Mayor
  "1312845999366209681", // 5: Capitan
  "1312845999366209680", // 6: Teniente
  "1312845999366209679", // 7: Subteniente
  "1312845999366209678", // 8: Veterano
  "1312845999366209677", // 9: Caporal
  "1312845999340781649", // 10: Asesino
  "1312845999340781648", // 11: Guardia
  "1312845999340781647", // 12: Soldato
  "1408492476351778836", // 13: Novato
  "1312845999366209682", // 14: Réserviste
] as const;

/**
 * Grade labels indexed by role ID
 */
const GRADE_LABELS: Record<string, string> = {
  "1312845999739375710": "Général",
  "1312845999366209686": "Consejero",
  "1312845999366209685": "Comandante",
  "1312845999366209684": "Coronel",
  "1408485173527445627": "Mayor",
  "1312845999366209681": "Capitan",
  "1312845999366209680": "Teniente",
  "1312845999366209679": "Subteniente",
  "1312845999366209678": "Veterano",
  "1312845999366209677": "Caporal",
  "1312845999340781649": "Asesino",
  "1312845999340781648": "Guardia",
  "1312845999340781647": "Soldato",
  "1408492476351778836": "Novato",
  "1312845999366209682": "Réserviste",
};

// ==================== TYPES ====================

/**
 * Type for grade role IDs (literal union)
 */
export type GradeRoleId = typeof GRADE_ROLE_IDS[number];

/**
 * Type for grade labels
 */
export type GradeLabel = 
  | "Général"
  | "Consejero"
  | "Comandante"
  | "Coronel"
  | "Mayor"
  | "Capitan"
  | "Teniente"
  | "Subteniente"
  | "Veterano"
  | "Caporal"
  | "Asesino"
  | "Guardia"
  | "Soldato"
  | "Novato"
  | "Réserviste";

/**
 * Result of grade picking from roles
 */
export type GradeResult = {
  /** The grade role ID (one of 15 managed IDs, or null) */
  id: string | null;
  /** The grade label (e.g. "Caporal") */
  label: string | null;
  /** The array index in GRADE_ROLE_IDS (0=Général, 14=Réserviste) or null */
  rank: number | null;
};

// ==================== FUNCTIONS ====================

/**
 * Validate a Discord user ID (17-20 digits)
 * 
 * @param str - String to validate
 * @returns true if valid Discord ID
 */
export function isValidDiscordId(str: string | null | undefined): boolean {
  if (!str || typeof str !== "string") return false;
  return /^\d{17,20}$/.test(str.trim());
}

/**
 * Get the label for a grade role ID
 * 
 * @param roleId - The Discord role ID
 * @returns The grade label, or null if not a grade role
 */
export function getGradeLabel(roleId: string): string | null {
  return GRADE_LABELS[roleId] ?? null;
}

/**
 * Check if a role ID is a grade role
 * 
 * @param roleId - The Discord role ID
 * @returns true if this is one of the 15 managed grade roles
 */
export function isGradeRole(roleId: string): boolean {
  return roleId in GRADE_LABELS;
}

/**
 * Pick the first grade from a list of role IDs
 * 
 * Iterates through GRADE_ROLE_IDS in order (highest rank first)
 * and returns the first match found in the roleIds array.
 * 
 * This ensures:
 * - At most 1 grade per member (even if they somehow have multiple)
 * - Deterministic ordering (always picks highest rank if multiple)
 * 
 * @param roleIds - Array of Discord role IDs the user has
 * @returns { id, label, rank } or { null, null, null } if no grade found
 */
export function pickGradeFromRoleIds(
  roleIds: string[] | null | undefined
): GradeResult {
  if (!roleIds || !Array.isArray(roleIds) || roleIds.length === 0) {
    return { id: null, label: null, rank: null };
  }

  // Create a set for O(1) lookup
  const roleSet = new Set(roleIds);

  // Iterate through grades in order (highest to lowest)
  for (let i = 0; i < GRADE_ROLE_IDS.length; i++) {
    const gradeRoleId = GRADE_ROLE_IDS[i];
    if (roleSet.has(gradeRoleId)) {
      return {
        id: gradeRoleId,
        label: GRADE_LABELS[gradeRoleId],
        rank: i, // 0 = Général, 14 = Réserviste
      };
    }
  }

  // No grade found
  return { id: null, label: null, rank: null };
}

/**
 * Get all grade role IDs
 * 
 * @returns Array of 15 grade role IDs in order
 */
export function getAllGradeRoleIds(): ReadonlyArray<string> {
  return GRADE_ROLE_IDS;
}

/**
 * Get all grades as entries
 * 
 * @returns Array of [id, label] tuples
 */
export function getAllGrades(): Array<[string, string]> {
  return GRADE_ROLE_IDS.map((id) => [id, GRADE_LABELS[id]]);
}
