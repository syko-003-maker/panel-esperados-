import { describe, it, expect } from "vitest";
import {
  normalizeMeetingTargetGrade,
  findRoleIdForGradeLabel,
  RANK_ROLE_ID_BY_LABEL,
} from "@/lib/staff/meetings/finalize/target-grade";
import { GRADE_LABEL_BY_ROLE_ID } from "@/lib/grade-colors";

describe("normalizeMeetingTargetGrade", () => {
  it("grade canonique → renvoyé tel quel", () => {
    // Prend le premier label défini dans la map réelle
    const firstLabel = Object.values(GRADE_LABEL_BY_ROLE_ID)[0];
    if (firstLabel) {
      expect(normalizeMeetingTargetGrade(firstLabel)).toBe(firstLabel);
    }
  });

  it("case-insensitive match → renvoie la version canonique", () => {
    const firstLabel = Object.values(GRADE_LABEL_BY_ROLE_ID)[0];
    if (firstLabel) {
      expect(normalizeMeetingTargetGrade(firstLabel.toLowerCase())).toBe(firstLabel);
      expect(normalizeMeetingTargetGrade(firstLabel.toUpperCase())).toBe(firstLabel);
    }
  });

  it("trim les espaces", () => {
    const firstLabel = Object.values(GRADE_LABEL_BY_ROLE_ID)[0];
    if (firstLabel) {
      expect(normalizeMeetingTargetGrade("  " + firstLabel + "  ")).toBe(firstLabel);
    }
  });

  it("null / undefined / vide → null", () => {
    expect(normalizeMeetingTargetGrade(null)).toBeNull();
    expect(normalizeMeetingTargetGrade(undefined)).toBeNull();
    expect(normalizeMeetingTargetGrade("")).toBeNull();
    expect(normalizeMeetingTargetGrade("   ")).toBeNull();
  });

  it("grade inconnu → null", () => {
    expect(normalizeMeetingTargetGrade("totally-fake-grade-xyz")).toBeNull();
  });
});

describe("findRoleIdForGradeLabel", () => {
  it("label canonique → roleId", () => {
    const [firstRoleId, firstLabel] = Object.entries(GRADE_LABEL_BY_ROLE_ID)[0] ?? [];
    if (firstRoleId && firstLabel) {
      expect(findRoleIdForGradeLabel(firstLabel)).toBe(firstRoleId);
    }
  });

  it("label inconnu → null", () => {
    expect(findRoleIdForGradeLabel("totally-fake-grade-xyz")).toBeNull();
  });

  it("case-insensitive (s'aligne sur normalize)", () => {
    const [firstRoleId, firstLabel] = Object.entries(GRADE_LABEL_BY_ROLE_ID)[0] ?? [];
    if (firstRoleId && firstLabel) {
      expect(findRoleIdForGradeLabel(firstLabel.toUpperCase())).toBe(firstRoleId);
    }
  });
});

describe("RANK_ROLE_ID_BY_LABEL — cohérence avec GRADE_LABEL_BY_ROLE_ID", () => {
  it("contient le même nombre d'entrées (relation inverse)", () => {
    expect(RANK_ROLE_ID_BY_LABEL.size).toBe(Object.keys(GRADE_LABEL_BY_ROLE_ID).length);
  });

  it("chaque (label → roleId) est l'inverse de (roleId → label)", () => {
    for (const [roleId, label] of Object.entries(GRADE_LABEL_BY_ROLE_ID)) {
      expect(RANK_ROLE_ID_BY_LABEL.get(label.toLowerCase())).toBe(roleId);
    }
  });
});
