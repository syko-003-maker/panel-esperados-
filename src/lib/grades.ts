/**
 * Grade system configuration
 * Maps grades to levels and Discord role IDs
 */

export type GradeConfig = {
  name: string;
  level: number;
  roleId: string | null;
  permissions: ("staff" | "chef")[];
};

// Grade level mapping (higher = more senior)
export const GRADES: Record<string, GradeConfig> = {
  WL1: { name: "Whitelist 1", level: 1, roleId: null, permissions: [] },
  WL2: { name: "Whitelist 2", level: 2, roleId: null, permissions: [] },
  WL3: { name: "Whitelist 3", level: 3, roleId: null, permissions: [] },
  WL4: { name: "Whitelist 4", level: 4, roleId: null, permissions: [] },
  OFFICER: { name: "Officier", level: 5, roleId: null, permissions: ["staff"] },
  CAPTAIN: { name: "Capitaine", level: 6, roleId: null, permissions: ["staff"] },
  CHEF: { name: "Chef", level: 7, roleId: null, permissions: ["staff", "chef"] },
};

// Role ID mapping (configured via env or DB)
export const GRADE_ROLE_IDS: Record<string, string> = {
  WL1: process.env.DISCORD_ROLE_WL1 ?? "",
  WL2: process.env.DISCORD_ROLE_WL2 ?? "",
  WL3: process.env.DISCORD_ROLE_WL3 ?? "",
  WL4: process.env.DISCORD_ROLE_WL4 ?? "",
  OFFICER: process.env.DISCORD_ROLE_OFFICER ?? "",
  CAPTAIN: process.env.DISCORD_ROLE_CAPTAIN ?? "",
  CHEF: process.env.DISCORD_ROLE_CHEF ?? "",
};

// Protected roles that should never be removed
export const PROTECTED_ROLE_IDS = new Set(
  (process.env.DISCORD_PROTECTED_ROLES ?? "").split(",").filter(Boolean)
);

// All grade role IDs (for removal during sync)
export function getAllGradeRoleIds(): string[] {
  return Object.values(GRADE_ROLE_IDS).filter(Boolean);
}

// Get grade level from name
export function getGradeLevel(grade: string | null): number {
  if (!grade) return 0;
  return GRADES[grade.toUpperCase()]?.level ?? 0;
}

// Get role ID for a grade
export function getRoleIdForGrade(grade: string | null): string | null {
  if (!grade) return null;
  return GRADE_ROLE_IDS[grade.toUpperCase()] ?? null;
}

// Get grade name from level
export function getGradeFromLevel(level: number): string | null {
  const entry = Object.entries(GRADES).find(([, config]) => config.level === level);
  return entry ? entry[0] : null;
}

// Check if grade has staff permissions
export function isStaffGrade(grade: string | null): boolean {
  if (!grade) return false;
  const config = GRADES[grade.toUpperCase()];
  return config?.permissions.includes("staff") ?? false;
}

// Check if grade has chef permissions
export function isChefGrade(grade: string | null): boolean {
  if (!grade) return false;
  const config = GRADES[grade.toUpperCase()];
  return config?.permissions.includes("chef") ?? false;
}

// Parse grade from various formats
export function normalizeGrade(input: string | null | undefined): string | null {
  if (!input) return null;
  const normalized = input.trim().toUpperCase().replace(/\s+/g, "");
  
  // Handle common variations
  if (normalized.startsWith("WL") || normalized.startsWith("WHITELIST")) {
    const match = normalized.match(/(\d)/);
    if (match) return `WL${match[1]}`;
  }
  
  if (normalized.includes("OFFICIER") || normalized.includes("OFFICER")) return "OFFICER";
  if (normalized.includes("CAPITAINE") || normalized.includes("CAPTAIN")) return "CAPTAIN";
  if (normalized.includes("CHEF")) return "CHEF";
  
  // Direct match
  if (GRADES[normalized]) return normalized;
  
  return null;
}

// Compare grades (returns positive if a > b, negative if a < b, 0 if equal)
export function compareGrades(a: string | null, b: string | null): number {
  return getGradeLevel(a) - getGradeLevel(b);
}

// Get all grades sorted by level
export function getAllGradesSorted(): string[] {
  return Object.entries(GRADES)
    .sort(([, a], [, b]) => a.level - b.level)
    .map(([key]) => key);
}
