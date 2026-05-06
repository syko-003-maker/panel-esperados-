/**
 * Helpers pour la résolution du grade cible des promotions UP / DOUBLE_UP.
 *
 * Extrait de app/api/staff/meetings/[id]/finalize/route.ts (Lot 9).
 */

import { GRADE_LABEL_BY_ROLE_ID } from "@/lib/grade-colors";

/**
 * Map inverse : label de grade (lowercase) → roleId Discord.
 * Construite une seule fois au module load.
 */
export const RANK_ROLE_ID_BY_LABEL = new Map(
  Object.entries(GRADE_LABEL_BY_ROLE_ID).map(([roleId, label]) => [
    label.toLowerCase(),
    roleId,
  ])
);

/**
 * Normalise un label de grade arbitraire vers le label canonique.
 * Retourne null si :
 *   - le label est vide ou null/undefined
 *   - le label ne correspond à AUCUN grade Discord connu
 *
 * Comparaison case-insensitive.
 */
export function normalizeMeetingTargetGrade(
  value: string | null | undefined
): string | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  for (const label of Object.values(GRADE_LABEL_BY_ROLE_ID)) {
    if (label.toLowerCase() === normalized) return label;
  }
  return null;
}

/**
 * Trouve le roleId Discord correspondant à un label de grade canonique.
 * Retourne null si le label n'existe pas.
 *
 * Doit être appelé après normalizeMeetingTargetGrade() qui retourne déjà
 * le label canonique (case-correct).
 */
export function findRoleIdForGradeLabel(label: string): string | null {
  return RANK_ROLE_ID_BY_LABEL.get(label.toLowerCase()) ?? null;
}
