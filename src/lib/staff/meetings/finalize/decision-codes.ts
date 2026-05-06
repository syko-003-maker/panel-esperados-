/**
 * Mapping et résolution des codes de décision de réunion.
 *
 * VERROUILLE le comportement métier critique :
 *   - Une décision peut venir de `sanctionType` (string libre) ou
 *     `decisionType` (enum Prisma MeetingRowDecisionType)
 *   - `EXCLUDE` (legacy) et `EXCLUSION` (enum) sont MAPPÉS en `BLACKLIST`
 *     (la SanctionType Prisma n'a pas d'enum EXCLUDE)
 *   - `WARNING` (enum) → `AVERT_LEGER` (avertissement formel)
 *   - `WARNING_ORAL` → `AVERT_ORAL_REUNION`
 *   - `NONE`/null → `MAINTAIN` (pas de sanction)
 *
 * Toute modif de cette logique change les sanctions générées en finalize.
 * Tests unitaires verrouillent ces mappings.
 *
 * Extrait de app/api/staff/meetings/[id]/finalize/route.ts (Lot 9).
 */

import type { SanctionType } from "@prisma/client";

/** Liste exhaustive des SanctionType Prisma valides pour finalize. */
export const SANCTION_TYPES: SanctionType[] = [
  "AVERT_ORAL_PLAYTIME",
  "AVERT_ORAL_REUNION",
  "AVERT_LEGER",
  "AVERT_LOURD",
  "DEMOTE",
  "RESERVISTE",
  "BLACKLIST",
];

/**
 * Labels lisibles humainement par code de décision (pour les embeds Discord
 * et stats). null = pas de label affichable (décision filtrée).
 */
export const MEETING_DECISION_LABELS: Record<string, string | null> = {
  MAINTAIN: "Maintiens à sa place",
  KEEP: "Maintiens à sa place",
  NONE: "Maintiens à sa place",
  DEMOTE: "Démote",
  UP: "UP",
  DOUBLE_UP: "Double UP",
  WARN_LIGHT: "Avertissement léger",
  WARN_HEAVY: "Avertissement lourd",
  WARN: "Avertissement",
  WARNING: "Avertissement",
  PLAYTIME_WARN: "Averto playtime",
  AVERT_ORAL_PLAYTIME: "Averto playtime",
  AVERT_ORAL_REUNION: "Avertissement oral",
  AVERT_LEGER: "Avertissement léger",
  AVERT_LOURD: "Avertissement lourd",
  REMINDER: "Rappel",
  RESERVE: "Réserviste",
  RESERVIST: "Réserviste",
  RESERVISTE: "Réserviste",
  BLACKLIST: "Blacklist",
  EXCLUSION: "Exclusion",
  EXCLUDE: "Exclusion",
  WEEK_VALID_1: "Semaine Validé 1",
  WEEK_VALID_2: "Semaine Validé 2",
  WEEK_VALID_3: "Semaine Validé 3",
  WEEK_INVALID: "Semaine Non Validé",
  REMOVE_TEST_RANK: "Test validé (rang En test retiré)",
  OTHER: null,
  AUTRE: null,
  WARNING_ORAL: null,
};

/**
 * Résout le code de décision effectif d'une row :
 *   1. priorité au `sanctionType` (string libre, contient les codes business)
 *   2. fallback sur `decisionType` (enum Prisma) avec mappings :
 *        NONE → MAINTAIN
 *        EXCLUDE → EXCLUSION
 *        WARNING → AVERT_LEGER (avertissement formel)
 *        WARNING_ORAL → AVERT_ORAL_REUNION
 *   3. sinon : retourne le decisionType uppercased tel quel
 */
export function resolveMeetingDecisionCode(row: {
  sanctionType?: string | null;
  decisionType?: string | null;
}): string {
  const sanctionCode = String(row.sanctionType ?? "").trim().toUpperCase();
  if (sanctionCode) return sanctionCode;

  const decisionCode = String(row.decisionType ?? "NONE").trim().toUpperCase();
  if (decisionCode === "NONE") return "MAINTAIN";
  if (decisionCode === "EXCLUDE") return "EXCLUSION";
  if (decisionCode === "WARNING") return "AVERT_LEGER";
  if (decisionCode === "WARNING_ORAL") return "AVERT_ORAL_REUNION";
  return decisionCode;
}

/** Renvoie le label lisible d'une décision, ou null si non affichable. */
export function translateMeetingDecision(code: string | null | undefined): string | null {
  const normalized = String(code ?? "").trim().toUpperCase();
  if (!normalized) return null;
  return MEETING_DECISION_LABELS[normalized] ?? null;
}

/**
 * Mappe une décision résolue (rawDecision) vers son SanctionType Prisma.
 *
 * Cas particulier verrouillé :
 *   - EXCLUDE / EXCLUSION → BLACKLIST (le worker Discord ne sait pas
 *     traiter EXCLUDE/EXCLUSION ; on cast en BLACKLIST côté finalize).
 *
 * Retourne null si la décision n'est pas une SanctionType valide
 * (ex: UP / DOUBLE_UP / MAINTAIN / REMOVE_TEST_RANK / WEEK_*) →
 * la finalize n'enqueue pas de sanction pour cette row.
 */
export function decisionToSanctionType(rawDecision: string): SanctionType | null {
  const effective =
    rawDecision === "EXCLUDE" || rawDecision === "EXCLUSION"
      ? "BLACKLIST"
      : rawDecision;
  return SANCTION_TYPES.includes(effective as SanctionType)
    ? (effective as SanctionType)
    : null;
}

/** Codes de décision qui déclenchent une promotion (UP / DOUBLE_UP). */
export function isPromotionDecision(rawDecision: string): boolean {
  return rawDecision === "UP" || rawDecision === "DOUBLE_UP";
}
