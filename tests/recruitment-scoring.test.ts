import { describe, it, expect } from "vitest";
import { computeRecruitmentTotals } from "@/lib/recruitment/scoring";
import { questionBank, TOTAL_MAX_POINTS } from "@/lib/recruitment/questionBank";

describe("computeRecruitmentTotals", () => {
  it("scores null → 0/0", () => {
    const r = computeRecruitmentTotals(null);
    expect(r.totalPoints).toBe(0);
    expect(r.totalOn20).toBe(0);
  });

  it("scores undefined → 0/0", () => {
    const r = computeRecruitmentTotals(undefined);
    expect(r.totalPoints).toBe(0);
    expect(r.totalOn20).toBe(0);
  });

  it("scores objet vide → 0/0", () => {
    const r = computeRecruitmentTotals({});
    expect(r.totalPoints).toBe(0);
    expect(r.totalOn20).toBe(0);
  });

  it("scores tableau → ignoré, 0/0", () => {
    const r = computeRecruitmentTotals([1, 2, 3]);
    expect(r.totalPoints).toBe(0);
    expect(r.totalOn20).toBe(0);
  });

  it("score string non numérique → ignoré", () => {
    const id = questionBank[0].id;
    const r = computeRecruitmentTotals({ [id]: "not-a-number" });
    expect(r.totalPoints).toBe(0);
  });

  it("score numérique valide → ajoute pointsMax max", () => {
    const q = questionBank[0];
    const r = computeRecruitmentTotals({ [q.id]: q.pointsMax });
    expect(r.totalPoints).toBe(q.pointsMax);
  });

  it("score > pointsMax → clamp à pointsMax", () => {
    const q = questionBank[0];
    const r = computeRecruitmentTotals({ [q.id]: 999 });
    expect(r.totalPoints).toBe(q.pointsMax);
  });

  it("score négatif → clamp à 0", () => {
    const q = questionBank[0];
    const r = computeRecruitmentTotals({ [q.id]: -10 });
    expect(r.totalPoints).toBe(0);
  });

  it("score string-numérique → parsé", () => {
    const q = questionBank[0];
    const r = computeRecruitmentTotals({ [q.id]: String(q.pointsMax) });
    expect(r.totalPoints).toBe(q.pointsMax);
  });

  it("scores complets pour toutes questions → totalOn20 = 20", () => {
    const allMax = Object.fromEntries(questionBank.map((q) => [q.id, q.pointsMax]));
    const r = computeRecruitmentTotals(allMax);
    expect(r.totalPoints).toBe(TOTAL_MAX_POINTS);
    expect(r.totalOn20).toBe(20);
  });

  it("totalOn20 arrondi à 2 décimales", () => {
    const q = questionBank[0];
    const r = computeRecruitmentTotals({ [q.id]: 1 });
    // Vérifie qu'on n'a pas plus de 2 décimales
    const decimals = (r.totalOn20.toString().split(".")[1] ?? "").length;
    expect(decimals).toBeLessThanOrEqual(2);
  });
});
