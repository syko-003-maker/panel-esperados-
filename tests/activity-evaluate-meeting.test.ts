import { describe, it, expect } from "vitest";
import {
  evaluateMeetingActivity,
  median,
  type EvaluationMember,
  type MeetingHistoryEntry,
} from "@/lib/activity/evaluate-meeting";

const NOW = new Date("2026-08-09T19:00:00.000Z");

/** Réunion synthétique : une ligne par membre, playtime donné. */
function meeting(id: string, date: string, rows: Array<[string, number]>): MeetingHistoryEntry {
  return {
    meetingId: id,
    meetingDate: date,
    rows: rows.map(([discordId, playtimeMinutes]) => ({ discordId, playtimeMinutes })),
  };
}

/** Date ISO située à N jours avant NOW. */
function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}

function member(discordId: string, over: Partial<EvaluationMember> = {}): EvaluationMember {
  return { discordId, name: discordId, ...over };
}

/**
 * Réunion « saine » : une médiane bien au-dessus de 10 pour que le garde-fou
 * « relevé atypique » ne s'active pas et n'interfère pas avec le cas testé.
 */
function healthyRows(target: [string, number]): Array<[string, number]> {
  return [target, ["filler-1", 400], ["filler-2", 500], ["filler-3", 600]];
}

const FILLERS = [member("filler-1"), member("filler-2"), member("filler-3")];

describe("median", () => {
  it("renvoie 0 sur une série vide", () => {
    expect(median([])).toBe(0);
  });

  it("gère les longueurs paires et impaires", () => {
    expect(median([10, 20, 30])).toBe(20);
    expect(median([10, 20, 30, 40])).toBe(25);
  });
});

describe("inactivité — réunions consécutives à zéro", () => {
  const bankSilent = { lastBankLogAt: daysAgo(40) };

  it("1 réunion à 0 ne suffit pas", () => {
    const res = evaluateMeetingActivity({
      meeting: meeting("m3", "2026-08-09", healthyRows(["u1", 0])),
      history: [
        meeting("m1", "2026-07-26", healthyRows(["u1", 500])),
        meeting("m2", "2026-08-02", healthyRows(["u1", 500])),
      ],
      members: [member("u1", bankSilent), ...FILLERS],
      now: NOW,
    });
    const d = res.decisions.find((x) => x.discordId === "u1")!;
    expect(d.consecutiveZeroMeetings).toBe(1);
    expect(d.isInactive).toBe(false);
    expect(d.emit).not.toContain("INACTIVE");
  });

  it("2 réunions à 0 ne suffisent pas", () => {
    const res = evaluateMeetingActivity({
      meeting: meeting("m3", "2026-08-09", healthyRows(["u1", 0])),
      history: [
        meeting("m1", "2026-07-26", healthyRows(["u1", 500])),
        meeting("m2", "2026-08-02", healthyRows(["u1", 0])),
      ],
      members: [member("u1", bankSilent), ...FILLERS],
      now: NOW,
    });
    const d = res.decisions.find((x) => x.discordId === "u1")!;
    expect(d.consecutiveZeroMeetings).toBe(2);
    expect(d.isInactive).toBe(false);
  });

  it("3 réunions à 0 déclenchent INACTIVE", () => {
    const res = evaluateMeetingActivity({
      meeting: meeting("m3", "2026-08-09", healthyRows(["u1", 0])),
      history: [
        meeting("m1", "2026-07-26", healthyRows(["u1", 0])),
        meeting("m2", "2026-08-02", healthyRows(["u1", 0])),
      ],
      members: [member("u1", bankSilent), ...FILLERS],
      now: NOW,
    });
    const d = res.decisions.find((x) => x.discordId === "u1")!;
    expect(d.consecutiveZeroMeetings).toBe(3);
    expect(d.isInactive).toBe(true);
    expect(d.emit).toContain("INACTIVE");
    expect(d.inactiveCycles).toBe(1);
  });
});

describe("garde-fou bancaire", () => {
  it("une opération bancaire récente disculpe malgré 3 réunions à 0", () => {
    const res = evaluateMeetingActivity({
      meeting: meeting("m3", "2026-08-09", healthyRows(["u1", 0])),
      history: [
        meeting("m1", "2026-07-26", healthyRows(["u1", 0])),
        meeting("m2", "2026-08-02", healthyRows(["u1", 0])),
      ],
      members: [member("u1", { lastBankLogAt: daysAgo(5) }), ...FILLERS],
      now: NOW,
    });
    const d = res.decisions.find((x) => x.discordId === "u1")!;
    expect(d.consecutiveZeroMeetings).toBe(3);
    expect(d.daysSinceBankLog).toBe(5);
    expect(d.isInactive).toBe(false);
    expect(d.reasons.some((r) => r.includes("Disculpé par la banque"))).toBe(true);
  });

  it("aucune opération bancaire connue ne disculpe pas", () => {
    const res = evaluateMeetingActivity({
      meeting: meeting("m3", "2026-08-09", healthyRows(["u1", 0])),
      history: [
        meeting("m1", "2026-07-26", healthyRows(["u1", 0])),
        meeting("m2", "2026-08-02", healthyRows(["u1", 0])),
      ],
      members: [member("u1", { lastBankLogAt: null }), ...FILLERS],
      now: NOW,
    });
    expect(res.decisions.find((x) => x.discordId === "u1")!.isInactive).toBe(true);
  });
});

describe("seuils de playtime", () => {
  it("le seuil individuel prime sur le seuil familial", () => {
    // 250 min : sous le familial (300) mais au-dessus de l'individuel (200).
    const res = evaluateMeetingActivity({
      meeting: meeting("m1", "2026-08-09", healthyRows(["u1", 250])),
      history: [],
      members: [member("u1", { playtimeRequiredMinutes: 200 }), ...FILLERS],
      now: NOW,
    });
    const d = res.decisions.find((x) => x.discordId === "u1")!;
    expect(d.thresholdApplied).toBe(200);
    expect(d.isLow).toBe(false);
  });

  it("le seuil familial de 300 s'applique sans dérogation", () => {
    const res = evaluateMeetingActivity({
      meeting: meeting("m1", "2026-08-09", healthyRows(["u1", 250])),
      history: [],
      members: [member("u1"), ...FILLERS],
      now: NOW,
    });
    const d = res.decisions.find((x) => x.discordId === "u1")!;
    expect(d.thresholdApplied).toBe(300);
    expect(d.isLow).toBe(true);
    expect(d.emit).toContain("LOW");
  });

  it("un seuil individuel à 0 exempte totalement", () => {
    const res = evaluateMeetingActivity({
      meeting: meeting("m1", "2026-08-09", healthyRows(["u1", 0])),
      history: [],
      members: [member("u1", { playtimeRequiredMinutes: 0 }), ...FILLERS],
      now: NOW,
    });
    const d = res.decisions.find((x) => x.discordId === "u1")!;
    expect(d.isLow).toBe(false);
    expect(d.emit).not.toContain("LOW");
  });
});

describe("garde-fou relevé atypique", () => {
  it("médiane < 10 : les LOW sont retenus, pas émis", () => {
    const res = evaluateMeetingActivity({
      meeting: meeting("m1", "2026-08-09", [["u1", 0], ["u2", 1], ["u3", 2]]),
      history: [],
      members: [member("u1"), member("u2"), member("u3")],
      now: NOW,
    });
    expect(res.atypical).toBe(true);
    expect(res.toEmit.filter((e) => e.kind === "LOW")).toHaveLength(0);
    expect(res.heldLow).not.toBeNull();
    expect(res.heldLow!.discordIds).toEqual(["u1", "u2", "u3"]);
    expect(res.heldLow!.meetingId).toBe("m1");
  });

  it("médiane normale : les LOW sont émis", () => {
    const res = evaluateMeetingActivity({
      meeting: meeting("m1", "2026-08-09", [["u1", 100], ["u2", 150], ["u3", 200]]),
      history: [],
      members: [member("u1"), member("u2"), member("u3")],
      now: NOW,
    });
    expect(res.atypical).toBe(false);
    expect(res.toEmit.filter((e) => e.kind === "LOW")).toHaveLength(3);
    expect(res.heldLow).toBeNull();
  });

  it("le garde-fou ne bloque jamais INACTIVE", () => {
    const res = evaluateMeetingActivity({
      meeting: meeting("m3", "2026-08-09", [["u1", 0], ["u2", 0]]),
      history: [
        meeting("m1", "2026-07-26", [["u1", 0], ["u2", 0]]),
        meeting("m2", "2026-08-02", [["u1", 0], ["u2", 0]]),
      ],
      members: [member("u1", { lastBankLogAt: daysAgo(40) }), member("u2")],
      now: NOW,
    });
    expect(res.atypical).toBe(true);
    expect(res.toEmit.some((e) => e.kind === "INACTIVE")).toBe(true);
  });
});

describe("idempotence", () => {
  it("refinaliser la même réunion ne produit rien", () => {
    const res = evaluateMeetingActivity({
      meeting: meeting("m1", "2026-08-09", healthyRows(["u1", 0])),
      history: [],
      members: [member("u1"), ...FILLERS],
      lastEvaluatedMeetingId: "m1",
      now: NOW,
    });
    expect(res.evaluated).toBe(false);
    expect(res.skippedReason).toBe("already_evaluated");
    expect(res.toEmit).toHaveLength(0);
    expect(res.decisions).toHaveLength(0);
    expect(res.heldLow).toBeNull();
  });

  it("une réunion différente est bien évaluée", () => {
    const res = evaluateMeetingActivity({
      meeting: meeting("m2", "2026-08-09", healthyRows(["u1", 0])),
      history: [],
      members: [member("u1"), ...FILLERS],
      lastEvaluatedMeetingId: "m1",
      now: NOW,
    });
    expect(res.evaluated).toBe(true);
  });
});

describe("transitions d'état", () => {
  const threeZeros = {
    meeting: meeting("m3", "2026-08-09", healthyRows(["u1", 0])),
    history: [
      meeting("m1", "2026-07-26", healthyRows(["u1", 0])),
      meeting("m2", "2026-08-02", healthyRows(["u1", 0])),
    ],
  };

  it("actif → inactif → recommandation au 2e cycle", () => {
    // Cycle 1 : première apparition de l'inactivité.
    const c1 = evaluateMeetingActivity({
      ...threeZeros,
      members: [member("u1", { lastBankLogAt: daysAgo(40) }), ...FILLERS],
      now: NOW,
    });
    const d1 = c1.decisions.find((x) => x.discordId === "u1")!;
    expect(d1.emit).toContain("INACTIVE");
    expect(d1.emit).not.toContain("RECOMMEND_KICK");
    expect(d1.inactiveCycles).toBe(1);

    // Cycle 2 : l'état persiste, la recommandation part.
    const c2 = evaluateMeetingActivity({
      ...threeZeros,
      meeting: meeting("m4", "2026-08-16", healthyRows(["u1", 0])),
      members: [
        member("u1", {
          lastBankLogAt: daysAgo(40),
          inactiveCycles: 1,
          alreadyAlerted: { inactive: true },
        }),
        ...FILLERS,
      ],
      now: NOW,
    });
    const d2 = c2.decisions.find((x) => x.discordId === "u1")!;
    expect(d2.emit).not.toContain("INACTIVE"); // déjà alerté : pas de doublon
    expect(d2.emit).toContain("RECOMMEND_KICK");
    expect(d2.inactiveCycles).toBe(2);
  });

  it("un membre durablement inactif n'est pas réalerté", () => {
    const res = evaluateMeetingActivity({
      ...threeZeros,
      members: [
        member("u1", {
          // Un membre à 0 de playtime est AUSSI sous le seuil : sans
          // `lowPlaytime`, le LOW partirait légitimement et le test décrirait
          // mal l'intention (« plus aucune alerte quand tout a déjà été dit »).
          lastBankLogAt: daysAgo(40),
          inactiveCycles: 5,
          alreadyAlerted: { inactive: true, recommendKick: true, lowPlaytime: true },
        }),
        ...FILLERS,
      ],
      now: NOW,
    });
    expect(res.decisions.find((x) => x.discordId === "u1")!.emit).toHaveLength(0);
  });

  it("le retour d'activité remet les compteurs à zéro et lève les drapeaux", () => {
    const res = evaluateMeetingActivity({
      meeting: meeting("m4", "2026-08-16", healthyRows(["u1", 800])),
      history: [meeting("m3", "2026-08-09", healthyRows(["u1", 0]))],
      members: [
        member("u1", {
          lastBankLogAt: daysAgo(40),
          inactiveCycles: 3,
          alreadyAlerted: { inactive: true, recommendKick: true, lowPlaytime: true },
        }),
        ...FILLERS,
      ],
      now: NOW,
    });
    const d = res.decisions.find((x) => x.discordId === "u1")!;
    expect(d.isInactive).toBe(false);
    expect(d.inactiveCycles).toBe(0);
    expect(d.clear).toContain("INACTIVE");
    expect(d.clear).toContain("RECOMMEND_KICK");
    expect(d.clear).toContain("LOW");
    expect(d.emit).toHaveLength(0);
  });
});

describe("garanties de sûreté", () => {
  it("aucune décision d'exclusion automatique n'est produite", () => {
    const res = evaluateMeetingActivity({
      meeting: meeting("m3", "2026-08-09", healthyRows(["u1", 0])),
      history: [
        meeting("m1", "2026-07-26", healthyRows(["u1", 0])),
        meeting("m2", "2026-08-02", healthyRows(["u1", 0])),
      ],
      members: [
        member("u1", { lastBankLogAt: daysAgo(90), inactiveCycles: 10 }),
        ...FILLERS,
      ],
      now: NOW,
    });
    // Le résultat ne contient QUE des alertes : aucun ordre de kick, de retrait
    // de rôle ou d'action LYG n'existe dans le type de sortie.
    const kinds = new Set(res.toEmit.map((e) => e.kind));
    for (const kind of kinds) {
      expect(["INACTIVE", "LOW", "RECOMMEND_KICK"]).toContain(kind);
    }
  });

  it("une exemption temporaire neutralise INACTIVE et LOW", () => {
    const res = evaluateMeetingActivity({
      meeting: meeting("m3", "2026-08-09", healthyRows(["u1", 0])),
      history: [
        meeting("m1", "2026-07-26", healthyRows(["u1", 0])),
        meeting("m2", "2026-08-02", healthyRows(["u1", 0])),
      ],
      members: [
        member("u1", { lastBankLogAt: daysAgo(90), exemptUntil: daysAgo(-30) }),
        ...FILLERS,
      ],
      now: NOW,
    });
    const d = res.decisions.find((x) => x.discordId === "u1")!;
    expect(d.isInactive).toBe(false);
    expect(d.isLow).toBe(false);
    expect(d.emit).toHaveLength(0);
  });
});
