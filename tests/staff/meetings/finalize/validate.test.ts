import { describe, it, expect } from "vitest";
import {
  findMissingPromotionTargets,
  buildPromotionDecisionMap,
} from "@/lib/staff/meetings/finalize/validate";
import { GRADE_LABEL_BY_ROLE_ID } from "@/lib/grade-colors";

const validGrade = Object.values(GRADE_LABEL_BY_ROLE_ID)[0]!; // grade canonique réel

describe("buildPromotionDecisionMap", () => {
  it("indexe par memberDiscordId valide", () => {
    const map = buildPromotionDecisionMap([
      { memberDiscordId: "111", newGrade: "Veterano" },
      { memberDiscordId: "222", newGrade: "Subteniente" },
    ]);
    expect(map.size).toBe(2);
    expect(map.get("111")?.newGrade).toBe("Veterano");
  });

  it("filtre les decisions sans memberDiscordId", () => {
    const map = buildPromotionDecisionMap([
      { memberDiscordId: null, newGrade: "X" },
      { memberDiscordId: "", newGrade: "X" },
      { memberDiscordId: "  ", newGrade: "X" },
      { memberDiscordId: "111", newGrade: "OK" },
    ]);
    expect(map.size).toBe(1);
    expect(map.get("111")?.newGrade).toBe("OK");
  });
});

describe("findMissingPromotionTargets", () => {
  it("retourne array vide si aucune row n'est UP/DOUBLE_UP", () => {
    const rows = [
      { sanctionType: "DEMOTE", discordIdSnapshot: "111" },
      { sanctionType: "BLACKLIST", discordIdSnapshot: "222" },
    ];
    expect(findMissingPromotionTargets(rows, new Map())).toEqual([]);
  });

  it("retourne array vide si toutes les UP ont un targetGrade valide", () => {
    const rows = [
      { sanctionType: "UP", discordIdSnapshot: "111", rpNameSnapshot: "Aziz" },
    ];
    const decisions = new Map([
      ["111", { memberDiscordId: "111", newGrade: validGrade }],
    ]);
    expect(findMissingPromotionTargets(rows, decisions)).toEqual([]);
  });

  it("UP sans decision associée → flagué", () => {
    const rows = [
      { sanctionType: "UP", discordIdSnapshot: "111", rpNameSnapshot: "Aziz" },
    ];
    const result = findMissingPromotionTargets(rows, new Map());
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      memberDiscordId: "111",
      memberName: "Aziz",
      targetGrade: null,
    });
  });

  it("UP avec newGrade invalide → flagué", () => {
    const rows = [
      { sanctionType: "UP", discordIdSnapshot: "111", rpNameSnapshot: "X" },
    ];
    const decisions = new Map([
      ["111", { memberDiscordId: "111", newGrade: "totally-fake-grade" }],
    ]);
    const result = findMissingPromotionTargets(rows, decisions);
    expect(result).toHaveLength(1);
    expect(result[0].targetGrade).toBeNull();
  });

  it("UP avec newGrade null → flagué", () => {
    const rows = [
      { sanctionType: "UP", discordIdSnapshot: "111", rpNameSnapshot: null },
    ];
    const decisions = new Map([
      ["111", { memberDiscordId: "111", newGrade: null }],
    ]);
    const result = findMissingPromotionTargets(rows, decisions);
    expect(result).toHaveLength(1);
    expect(result[0].memberName).toBeNull();
  });

  it("UP sans discordIdSnapshot → flagué avec 'unknown'", () => {
    const rows = [
      { sanctionType: "UP", discordIdSnapshot: null, rpNameSnapshot: "X" },
    ];
    const result = findMissingPromotionTargets(rows, new Map());
    expect(result).toHaveLength(1);
    expect(result[0].memberDiscordId).toBe("unknown");
  });

  it("DOUBLE_UP sans target → flagué (mêmes règles que UP)", () => {
    const rows = [
      { sanctionType: "DOUBLE_UP", discordIdSnapshot: "111", rpNameSnapshot: "X" },
    ];
    expect(findMissingPromotionTargets(rows, new Map())).toHaveLength(1);
  });

  it("mix : 2 UP dont 1 valide / 1 invalide → seul l'invalide flagué", () => {
    const rows = [
      { sanctionType: "UP", discordIdSnapshot: "111", rpNameSnapshot: "OK" },
      { sanctionType: "UP", discordIdSnapshot: "222", rpNameSnapshot: "KO" },
      { sanctionType: "DEMOTE", discordIdSnapshot: "333", rpNameSnapshot: "Demoted" }, // pas une promotion
    ];
    const decisions = new Map([
      ["111", { memberDiscordId: "111", newGrade: validGrade }],
      // 222 manquant
    ]);
    const result = findMissingPromotionTargets(rows, decisions);
    expect(result).toHaveLength(1);
    expect(result[0].memberDiscordId).toBe("222");
  });

  it("decisionType=UP via fallback (sanctionType absent) → traité aussi", () => {
    const rows = [
      { sanctionType: null, decisionType: "UP", discordIdSnapshot: "111", rpNameSnapshot: "X" },
    ];
    expect(findMissingPromotionTargets(rows, new Map())).toHaveLength(1);
  });
});
