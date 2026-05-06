/**
 * Validations préalables avant l'application des décisions de finalize.
 *
 * Extrait de app/api/staff/meetings/[id]/finalize/route.ts (Lot 9).
 */

import {
  isPromotionDecision,
  resolveMeetingDecisionCode,
} from "./decision-codes";
import { normalizeMeetingTargetGrade } from "./target-grade";

export interface MissingPromotionTarget {
  memberDiscordId: string;
  memberName: string | null;
  targetGrade: string | null; // toujours null ici (raison du blocage)
}

interface RowLike {
  discordIdSnapshot?: string | null;
  rpNameSnapshot?: string | null;
  sanctionType?: string | null;
  decisionType?: string | null;
}

interface DecisionLike {
  memberDiscordId: string;
  newGrade?: string | null;
}

/**
 * Trouve les rows de promotion (UP / DOUBLE_UP) qui n'ont PAS de targetGrade
 * normalisable dans les decisions associées.
 *
 * Retour : array vide si toutes les promotions ont leur target → finalize peut continuer.
 *          Sinon : la finalize doit être bloquée avec 409 TARGET_GRADE_REQUIRED.
 */
export function findMissingPromotionTargets(
  rows: RowLike[],
  decisionsByDiscordId: Map<string, DecisionLike>
): MissingPromotionTarget[] {
  return rows
    .filter((row) => isPromotionDecision(resolveMeetingDecisionCode(row)))
    .map((row) => {
      const memberDiscordId = String(row.discordIdSnapshot ?? "").trim();
      const decision = memberDiscordId
        ? decisionsByDiscordId.get(memberDiscordId)
        : null;
      const targetGrade = normalizeMeetingTargetGrade(decision?.newGrade ?? null);
      return {
        memberDiscordId: memberDiscordId || "unknown",
        memberName: row.rpNameSnapshot ?? null,
        targetGrade,
      };
    })
    .filter((item) => !item.targetGrade);
}

/**
 * Construit le Map des decisions indexé par memberDiscordId (utilisé par
 * findMissingPromotionTargets et par le main loop).
 */
export function buildPromotionDecisionMap(
  decisions: Array<{ memberDiscordId?: string | null; newGrade?: string | null }>
): Map<string, DecisionLike> {
  return new Map(
    decisions
      .filter(
        (d): d is DecisionLike =>
          typeof d.memberDiscordId === "string" && d.memberDiscordId.trim() !== ""
      )
      .map((d) => [d.memberDiscordId, d])
  );
}
