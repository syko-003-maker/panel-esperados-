/**
 * Helpers pour la résolution du grade cible des promotions UP / DOUBLE_UP.
 *
 * Extrait de app/api/staff/meetings/[id]/finalize/route.ts (Lot 9).
 */

import { GRADE_LABEL_BY_ROLE_ID } from "@/lib/grade-colors";

/**
 * Grades INTERDITS comme cible de promotion via une feuille de réunion.
 *
 * Pourquoi : la route /api/staff/meetings/[id]/finalize est gardée par
 * requireChef() qui accepte CHEF_FAMILLE + SOUS_CHEF_FAMILLE + ETAT_MAJOR.
 * Donc n'importe quel État-Major peut finaliser une réunion. S'il pouvait
 * y inscrire "Chef famille" ou "Général" en grade cible, il pourrait se
 * promouvoir lui-même au rang le plus haut.
 *
 * Ces promotions doivent rester une action manuelle du Chef famille
 * (côté Discord ou via un endpoint dédié à venir), pas un effet de bord
 * d'une réunion hebdomadaire.
 *
 * Comparaison case-insensitive.
 */
const PROTECTED_PROMOTION_GRADES_LC = new Set<string>([
  "chef famille",
  "sous-chef famille",
  "général",
  "general", // au cas où sans accent
  "consejero", // Chef État-Major
]);

/**
 * Renvoie true si le label correspond à un grade interdit en cible de
 * promotion. À appeler après normalizeMeetingTargetGrade() (le label est
 * canonique à ce stade) — mais on accepte aussi des entrées brutes pour
 * être défensif.
 */
export function isProtectedPromotionTargetGrade(
  label: string | null | undefined,
): boolean {
  const normalized = String(label ?? "").trim().toLowerCase();
  return PROTECTED_PROMOTION_GRADES_LC.has(normalized);
}

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
