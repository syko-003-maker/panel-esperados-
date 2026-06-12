import { questionBank } from "./questionBank";
import type { Question } from "./questionBank";

type ScoreMap = Record<string, unknown>;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Totaux d'un test. `questions` permet de calculer sur un modèle de
 * recrutement spécifique ; défaut = questionBank historique.
 */
export function computeRecruitmentTotals(scoresJson: unknown, questions: Question[] = questionBank) {
  const scores =
    scoresJson && typeof scoresJson === "object" && !Array.isArray(scoresJson)
      ? (scoresJson as ScoreMap)
      : {};

  let totalPoints = 0;

  for (const question of questions) {
    const raw = scores[question.id];
    const value = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : Number(raw);
    if (!Number.isFinite(value)) continue;
    totalPoints += clamp(value, 0, question.pointsMax);
  }

  const maxPoints = questions.reduce((acc, q) => acc + (Number(q.pointsMax) || 0), 0);
  const totalOn20Raw = maxPoints > 0 ? (totalPoints / maxPoints) * 20 : 0;
  const totalOn20 = Math.round(totalOn20Raw * 100) / 100;

  return { totalPoints, totalOn20 };
}
