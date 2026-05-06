import { describe, it, expect } from "vitest";
import {
  resolveMeetingDecisionCode,
  translateMeetingDecision,
  decisionToSanctionType,
  isPromotionDecision,
  SANCTION_TYPES,
  MEETING_DECISION_LABELS,
} from "@/lib/staff/meetings/finalize/decision-codes";

/**
 * Tests CRITIQUES — verrouillent les mappings de décisions de finalize.
 * Toute modif d'un mapping change les sanctions générées en réunion.
 */

describe("resolveMeetingDecisionCode", () => {
  it("priorité au sanctionType (string libre)", () => {
    expect(resolveMeetingDecisionCode({ sanctionType: "BLACKLIST", decisionType: "WARNING" })).toBe("BLACKLIST");
  });

  it("uppercase et trim le sanctionType", () => {
    expect(resolveMeetingDecisionCode({ sanctionType: "  blacklist  " })).toBe("BLACKLIST");
  });

  it("fallback decisionType si sanctionType absent", () => {
    expect(resolveMeetingDecisionCode({ sanctionType: null, decisionType: "DEMOTE" })).toBe("DEMOTE");
    expect(resolveMeetingDecisionCode({ sanctionType: "", decisionType: "DEMOTE" })).toBe("DEMOTE");
  });

  it("decisionType=NONE → MAINTAIN", () => {
    expect(resolveMeetingDecisionCode({ decisionType: "NONE" })).toBe("MAINTAIN");
    expect(resolveMeetingDecisionCode({})).toBe("MAINTAIN");
  });

  it("decisionType=EXCLUDE → EXCLUSION (legacy enum mapping)", () => {
    expect(resolveMeetingDecisionCode({ decisionType: "EXCLUDE" })).toBe("EXCLUSION");
  });

  it("decisionType=WARNING → AVERT_LEGER (avert formel)", () => {
    expect(resolveMeetingDecisionCode({ decisionType: "WARNING" })).toBe("AVERT_LEGER");
  });

  it("decisionType=WARNING_ORAL → AVERT_ORAL_REUNION", () => {
    expect(resolveMeetingDecisionCode({ decisionType: "WARNING_ORAL" })).toBe("AVERT_ORAL_REUNION");
  });

  it("decisionType inconnu → uppercased tel quel", () => {
    expect(resolveMeetingDecisionCode({ decisionType: "OTHER" })).toBe("OTHER");
    expect(resolveMeetingDecisionCode({ decisionType: "REMINDER" })).toBe("REMINDER");
  });
});

describe("translateMeetingDecision", () => {
  it("renvoie le label FR pour codes connus", () => {
    expect(translateMeetingDecision("MAINTAIN")).toBe("Maintiens à sa place");
    expect(translateMeetingDecision("DEMOTE")).toBe("Démote");
    expect(translateMeetingDecision("UP")).toBe("UP");
    expect(translateMeetingDecision("DOUBLE_UP")).toBe("Double UP");
    expect(translateMeetingDecision("BLACKLIST")).toBe("Blacklist");
    expect(translateMeetingDecision("EXCLUSION")).toBe("Exclusion");
    expect(translateMeetingDecision("AVERT_LEGER")).toBe("Avertissement léger");
    expect(translateMeetingDecision("AVERT_LOURD")).toBe("Avertissement lourd");
    expect(translateMeetingDecision("RESERVISTE")).toBe("Réserviste");
    expect(translateMeetingDecision("REMOVE_TEST_RANK")).toBe("Test validé (rang En test retiré)");
  });

  it("null pour codes 'noisy' (OTHER, AUTRE, WARNING_ORAL legacy)", () => {
    expect(translateMeetingDecision("OTHER")).toBeNull();
    expect(translateMeetingDecision("AUTRE")).toBeNull();
    expect(translateMeetingDecision("WARNING_ORAL")).toBeNull();
  });

  it("null pour code totalement inconnu", () => {
    expect(translateMeetingDecision("XXXX")).toBeNull();
  });

  it("null pour vide / null / undefined", () => {
    expect(translateMeetingDecision("")).toBeNull();
    expect(translateMeetingDecision(null)).toBeNull();
    expect(translateMeetingDecision(undefined)).toBeNull();
  });

  it("trim + uppercase le code", () => {
    expect(translateMeetingDecision("  demote  ")).toBe("Démote");
  });
});

describe("decisionToSanctionType — VERROUS MÉTIER", () => {
  it("EXCLUDE → BLACKLIST (le worker ne sait pas traiter EXCLUDE)", () => {
    expect(decisionToSanctionType("EXCLUDE")).toBe("BLACKLIST");
  });

  it("EXCLUSION → BLACKLIST (alias enum legacy)", () => {
    expect(decisionToSanctionType("EXCLUSION")).toBe("BLACKLIST");
  });

  it("BLACKLIST → BLACKLIST (passthrough)", () => {
    expect(decisionToSanctionType("BLACKLIST")).toBe("BLACKLIST");
  });

  it("DEMOTE → DEMOTE", () => {
    expect(decisionToSanctionType("DEMOTE")).toBe("DEMOTE");
  });

  it("RESERVISTE → RESERVISTE", () => {
    expect(decisionToSanctionType("RESERVISTE")).toBe("RESERVISTE");
  });

  it("AVERT_LEGER → AVERT_LEGER", () => {
    expect(decisionToSanctionType("AVERT_LEGER")).toBe("AVERT_LEGER");
  });

  it("AVERT_LOURD → AVERT_LOURD", () => {
    expect(decisionToSanctionType("AVERT_LOURD")).toBe("AVERT_LOURD");
  });

  it("AVERT_ORAL_PLAYTIME → AVERT_ORAL_PLAYTIME", () => {
    expect(decisionToSanctionType("AVERT_ORAL_PLAYTIME")).toBe("AVERT_ORAL_PLAYTIME");
  });

  it("AVERT_ORAL_REUNION → AVERT_ORAL_REUNION", () => {
    expect(decisionToSanctionType("AVERT_ORAL_REUNION")).toBe("AVERT_ORAL_REUNION");
  });

  it("MAINTAIN → null (pas de sanction)", () => {
    expect(decisionToSanctionType("MAINTAIN")).toBeNull();
  });

  it("UP / DOUBLE_UP → null (promotion, pas sanction)", () => {
    expect(decisionToSanctionType("UP")).toBeNull();
    expect(decisionToSanctionType("DOUBLE_UP")).toBeNull();
  });

  it("REMOVE_TEST_RANK → null (handled séparément)", () => {
    expect(decisionToSanctionType("REMOVE_TEST_RANK")).toBeNull();
  });

  it("WEEK_VALID_* / WEEK_INVALID → null", () => {
    expect(decisionToSanctionType("WEEK_VALID_1")).toBeNull();
    expect(decisionToSanctionType("WEEK_VALID_2")).toBeNull();
    expect(decisionToSanctionType("WEEK_VALID_3")).toBeNull();
    expect(decisionToSanctionType("WEEK_INVALID")).toBeNull();
  });

  it("REMINDER / OTHER / NONE → null", () => {
    expect(decisionToSanctionType("REMINDER")).toBeNull();
    expect(decisionToSanctionType("OTHER")).toBeNull();
    expect(decisionToSanctionType("NONE")).toBeNull();
  });

  it("code totalement inconnu → null", () => {
    expect(decisionToSanctionType("XXXX")).toBeNull();
    expect(decisionToSanctionType("")).toBeNull();
  });
});

describe("isPromotionDecision", () => {
  it("UP / DOUBLE_UP → true", () => {
    expect(isPromotionDecision("UP")).toBe(true);
    expect(isPromotionDecision("DOUBLE_UP")).toBe(true);
  });

  it("autre code → false", () => {
    expect(isPromotionDecision("DEMOTE")).toBe(false);
    expect(isPromotionDecision("BLACKLIST")).toBe(false);
    expect(isPromotionDecision("MAINTAIN")).toBe(false);
    expect(isPromotionDecision("WEEK_VALID_1")).toBe(false);
    expect(isPromotionDecision("")).toBe(false);
  });
});

describe("SANCTION_TYPES — verrouille la liste exhaustive", () => {
  it("contient EXACTEMENT 7 types Prisma", () => {
    expect([...SANCTION_TYPES].sort()).toEqual([
      "AVERT_LEGER",
      "AVERT_LOURD",
      "AVERT_ORAL_PLAYTIME",
      "AVERT_ORAL_REUNION",
      "BLACKLIST",
      "DEMOTE",
      "RESERVISTE",
    ]);
  });
});

describe("MEETING_DECISION_LABELS — verrouille les codes 'noisy' (label null)", () => {
  it("OTHER, AUTRE, WARNING_ORAL ont label null (filtrés des stats)", () => {
    expect(MEETING_DECISION_LABELS.OTHER).toBeNull();
    expect(MEETING_DECISION_LABELS.AUTRE).toBeNull();
    expect(MEETING_DECISION_LABELS.WARNING_ORAL).toBeNull();
  });
});
