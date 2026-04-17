import { DEMOTE_ROLE_ID } from "@/lib/discord-rbac";
import { GRADE_LABEL_BY_ROLE_ID, GRADE_ROLE_IDS_ORDERED } from "@/lib/grade-colors";

type DiscordGradeMapping = {
  roleId: string;
  grade: string;
};

// Access-only roles: used by RBAC/access checks, never displayed as family grade.
export const ACCESS_ROLE_IDS = {
  ETAT_MAJOR: "1312845999366209683",
} as const;

export const BLACKLIST_ROLE_ID = "1338901141873758288";
export const RESERVIST_ROLE_ID = "1312845999366209682";

const DISCORD_GRADE_PRIORITY: readonly DiscordGradeMapping[] = [
  { roleId: "1429607761720770623", grade: GRADE_LABEL_BY_ROLE_ID["1429607761720770623"] ?? "Chef famille" },
  ...GRADE_ROLE_IDS_ORDERED
    .filter((roleId) => roleId !== "1429607761720770623")
    .map((roleId) => ({
      roleId,
      grade: GRADE_LABEL_BY_ROLE_ID[roleId] ?? roleId,
    })),
];

const DISCORD_GRADE_BY_ROLE_ID = new Map(
  DISCORD_GRADE_PRIORITY.map((entry, index) => [
    entry.roleId,
    {
      grade: entry.grade,
      level: DISCORD_GRADE_PRIORITY.length - index,
    },
  ])
);

export function getDiscordGrade(roles: string[]): {
  grade: string | null;
  isDemoted: boolean;
  isBlacklisted: boolean;
  isReservist: boolean;
} {
  if (!Array.isArray(roles) || roles.length === 0) {
    return { grade: null, isDemoted: false, isBlacklisted: false, isReservist: false };
  }

  if (roles.includes(BLACKLIST_ROLE_ID)) {
    return { grade: "Blacklist", isDemoted: false, isBlacklisted: true, isReservist: false };
  }

  if (roles.includes(DEMOTE_ROLE_ID)) {
    return { grade: null, isDemoted: true, isBlacklisted: false, isReservist: false };
  }

  const roleSet = new Set(roles);
  for (const entry of DISCORD_GRADE_PRIORITY) {
    const mapped = DISCORD_GRADE_BY_ROLE_ID.get(entry.roleId);
    if (mapped && roleSet.has(entry.roleId)) {
      return {
        grade: mapped.grade,
        isDemoted: false,
        isBlacklisted: false,
        isReservist: entry.roleId === RESERVIST_ROLE_ID,
      };
    }
  }

  const isReservist = roles.includes(RESERVIST_ROLE_ID);
  return { grade: null, isDemoted: false, isBlacklisted: false, isReservist };
}

export function getDiscordGradeRoleId(roles: string[]): string | null {
  if (!Array.isArray(roles) || roles.length === 0 || roles.includes(DEMOTE_ROLE_ID) || roles.includes(BLACKLIST_ROLE_ID)) {
    return null;
  }

  const roleSet = new Set(roles);
  for (const entry of DISCORD_GRADE_PRIORITY) {
    if (roleSet.has(entry.roleId)) {
      return entry.roleId;
    }
  }

  return null;
}

export function getDiscordGradeLevel(roles: string[]): number | null {
  const roleId = getDiscordGradeRoleId(roles);
  if (!roleId) return null;
  return DISCORD_GRADE_BY_ROLE_ID.get(roleId)?.level ?? null;
}

export function getDiscordGradeMappings(): readonly DiscordGradeMapping[] {
  return DISCORD_GRADE_PRIORITY;
}

export function getAccessRoleIds(): string[] {
  return Object.values(ACCESS_ROLE_IDS);
}

export function hasAccessRole(roles: string[]): boolean {
  if (!Array.isArray(roles) || roles.length === 0) return false;
  const accessSet = new Set(getAccessRoleIds());
  return roles.some((roleId) => accessSet.has(roleId));
}
