import { questionBank, TOTAL_MAX_POINTS } from "./questionBank";

type ScoreMap = Record<string, unknown>;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function computeRecruitmentTotals(scoresJson: unknown) {
  const scores =
    scoresJson && typeof scoresJson === "object" && !Array.isArray(scoresJson)
      ? (scoresJson as ScoreMap)
      : {};

  let totalPoints = 0;

  for (const question of questionBank) {
    const raw = scores[question.id];
    const value = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : Number(raw);
    if (!Number.isFinite(value)) continue;
    totalPoints += clamp(value, 0, question.pointsMax);
  }

  const totalOn20Raw = TOTAL_MAX_POINTS > 0 ? (totalPoints / TOTAL_MAX_POINTS) * 20 : 0;
  const totalOn20 = Math.round(totalOn20Raw * 100) / 100;

  return { totalPoints, totalOn20 };
}
