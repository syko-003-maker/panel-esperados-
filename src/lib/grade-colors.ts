/**
 * Discord Grade System with Colors
 *
 * Maps role IDs to grade labels and Tailwind badge colors
 * Prioritized by hierarchy: Chef famille highest, Réserviste lowest
 */

/**
 * Rôles Discord qui accordent un accès "membre" au panel SANS être un grade
 * Famille hiérarchique. Les porteurs de ces rôles sont reconnus actifs par
 * le poller LYG, /staff/warns, /api/discord/member-status, etc., comme un
 * Novato lambda — mais ils ne sont pas listés dans la hiérarchie des grades.
 *
 * Ajouter un rôle ici = équivalent fonctionnel d'un membre basique pour les
 * checks d'activité, sans toucher à GRADE_ROLE_IDS_ORDERED.
 */
export const EXTRA_MEMBER_ROLE_IDS: readonly string[] = [
  // Nutella — grade « amis » : il est AUSSI listé dans GRADE_ROLE_IDS_ORDERED /
  // GRADE_LABEL_BY_ROLE_ID pour s'AFFICHER comme grade, mais il RESTE ici pour
  // garder « aucune obligation famille » : exclu des workflows réunion /
  // sanctions / warns / playtime (via flags.isExtraMember).
  "1465415073425133598", // Nutella
];

// Role IDs in priority order (highest to lowest)
export const GRADE_ROLE_IDS_ORDERED: readonly string[] = [
  "1429607761720770623", // Chef famille
  "1312845999739375710", // Général
  "1312845999366209686", // Consejero
  "1312845999366209685", // Comandante
  "1312845999366209684", // Coronel
  "1408485173527445627", // Mayor
  "1312845999366209681", // Capitan
  "1312845999366209680", // Teniente
  "1312845999366209679", // Subteniente
  "1312845999366209678", // Veterano
  "1312845999366209677", // Caporal
  "1312845999340781649", // Asesino
  "1312845999340781648", // Guardia
  "1312845999340781647", // Soldato
  "1408492476351778836", // Novato
  "1312845999366209682", // Réserviste
  "1465415073425133598", // Nutella — grade « amis » (sans obligation famille), le plus bas
];

// Grade label by role ID
export const GRADE_LABEL_BY_ROLE_ID: Record<string, string> = {
  "1429607761720770623": "Chef famille",
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
  "1465415073425133598": "Nutella",
};

// Badge styles by role ID (Tailwind classes for each grade)
export const GRADE_BADGE_STYLE_BY_ROLE_ID: Record<string, string> = {
  // Chef famille (red)
  "1429607761720770623": "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-red-500/15 border-red-400/30 text-red-300",

  // Général (amber/gold)
  "1312845999739375710": "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-amber-500/15 border-amber-400/30 text-amber-300",

  // Consejero (cyan/turquoise)
  "1312845999366209686": "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-cyan-500/15 border-cyan-400/30 text-cyan-300",

  // Comandante (lime/olive gray)
  "1312845999366209685": "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-lime-500/10 border-lime-400/20 text-lime-300",

  // Coronel (yellow)
  "1312845999366209684": "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-yellow-500/15 border-yellow-400/30 text-yellow-300",

  // Mayor (dark blue)
  "1408485173527445627": "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-blue-600/15 border-blue-500/25 text-blue-300",

  // Capitan (blue)
  "1312845999366209681": "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-blue-500/15 border-blue-400/30 text-blue-300",

  // Teniente (light blue/sky)
  "1312845999366209680": "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-sky-500/15 border-sky-400/30 text-sky-300",

  // Subteniente (light gray)
  "1312845999366209679": "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-slate-500/15 border-slate-400/25 text-slate-300",

  // Veterano (gray)
  "1312845999366209678": "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-slate-600/15 border-slate-500/25 text-slate-300",

  // Caporal (emerald/green)
  "1312845999366209677": "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-emerald-500/15 border-emerald-400/30 text-emerald-300",

  // Asesino (dark green)
  "1312845999340781649": "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-green-600/15 border-green-500/25 text-green-300",

  // Guardia (dark green)
  "1312845999340781648": "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-green-600/15 border-green-500/25 text-green-300",

  // Soldato (slate/gray-blue)
  "1312845999340781647": "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-slate-500/15 border-slate-400/25 text-slate-300",

  // Novato (teal/light turquoise)
  "1408492476351778836": "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-teal-500/15 border-teal-400/30 text-teal-300",

  // Réserviste (muted red/rose)
  "1312845999366209682": "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-rose-500/10 border-rose-400/20 text-rose-200",

  // Nutella (orange — grade « amis », sans obligation famille)
  "1465415073425133598": "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-orange-500/15 border-orange-400/30 text-orange-200",
};

// Special status badges
export const GRADE_BADGE_SPECIAL = {
  // Member not in guild (Discord Unknown Member)
  "NOT_IN_GUILD": "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-red-700/20 border-red-600/30 text-red-200",

  // No grade detected but linked
  "NO_GRADE": "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-zinc-500/10 border-zinc-400/20 text-zinc-200",

  // Not linked to Discord
  "NO_DISCORD_ID": "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-zinc-500/10 border-zinc-400/20 text-zinc-200",

  // Discord API error
  "FETCH_FAILED": "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-amber-500/20 border-amber-400/30 text-amber-300",

  // Already cached in DB
  "ALREADY_IN_DB": "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border bg-blue-500/20 border-blue-400/30 text-blue-300",
};

/**
 * Resolve the highest priority grade from a list of role IDs
 * 
 * Returns the role ID of the highest-priority grade present in userRoleIds,
 * following the hierarchy: Chef famille → Général → ... → Réserviste
 * 
 * @param userRoleIds - Array of Discord role IDs the user has
 * @returns Highest priority grade role ID, or null if no grade found
 */
export function resolveMemberGradeRoleId(userRoleIds: string[]): string | null {
  if (!userRoleIds || !Array.isArray(userRoleIds) || userRoleIds.length === 0) {
    return null;
  }

  // Check each role ID in priority order
  for (const gradeRoleId of GRADE_ROLE_IDS_ORDERED) {
    if (userRoleIds.includes(gradeRoleId)) {
      return gradeRoleId;
    }
  }

  // No grade role found
  return null;
}

/**
 * Get badge properties (label + className) for a grade role ID
 * 
 * @param roleId - Discord role ID, or special status like "NOT_IN_GUILD"
 * @returns { label: string, className: string }
 */
export function getGradeBadgeProps(
  roleId: string | null,
  status?: "NOT_IN_GUILD" | "FETCH_FAILED" | "NO_DISCORD_ID" | "ALREADY_IN_DB"
): { label: string; className: string } {
  // Handle special status badges
  if (status === "NOT_IN_GUILD") {
    return {
      label: "Hors serveur",
      className: GRADE_BADGE_SPECIAL.NOT_IN_GUILD,
    };
  }

  if (status === "FETCH_FAILED") {
    return {
      label: "Non vérifié",
      className: GRADE_BADGE_SPECIAL.FETCH_FAILED,
    };
  }

  if (status === "NO_DISCORD_ID") {
    return {
      label: "Non lié",
      className: GRADE_BADGE_SPECIAL.NO_DISCORD_ID,
    };
  }

  if (status === "ALREADY_IN_DB") {
    // Use cached grade from DB
    if (roleId && GRADE_LABEL_BY_ROLE_ID[roleId]) {
      return {
        label: GRADE_LABEL_BY_ROLE_ID[roleId],
        className: GRADE_BADGE_STYLE_BY_ROLE_ID[roleId],
      };
    }
    return {
      label: "Sans grade",
      className: GRADE_BADGE_SPECIAL.NO_GRADE,
    };
  }

  // Handle normal grade role ID
  if (roleId && GRADE_LABEL_BY_ROLE_ID[roleId]) {
    return {
      label: GRADE_LABEL_BY_ROLE_ID[roleId],
      className: GRADE_BADGE_STYLE_BY_ROLE_ID[roleId],
    };
  }

  // No grade detected
  return {
    label: "Sans grade",
    className: GRADE_BADGE_SPECIAL.NO_GRADE,
  };
}

/**
 * Get grade level number (for sorting)
 * Lower index in GRADE_ROLE_IDS_ORDERED = higher grade level
 * 
 * @param roleId - Discord role ID
 * @returns Grade level (higher = more senior), or -1 if not a grade role
 */
export function getGradeLevelNumber(roleId: string | null): number {
  if (!roleId) return -1;
  const index = (GRADE_ROLE_IDS_ORDERED as any as string[]).indexOf(roleId);
  return index === -1 ? -1 : 100 - index; // Invert so higher = more senior
}

/**
 * Check if a role ID is a managed grade role
 * 
 * @param roleId - Discord role ID
 * @returns true if this role is a managed grade role
 */
export function isGradeRole(roleId: string): boolean {
  return !!GRADE_LABEL_BY_ROLE_ID[roleId];
}

/**
 * Get all managed grade role IDs
 * 
 * @returns Array of all grade role IDs
 */
export function getGradeRoleIds(): string[] {
  return [...(GRADE_ROLE_IDS_ORDERED as any as string[])];
}
