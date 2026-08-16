import { describe, it, expect, vi } from "vitest";
import {
  planActivityEmission,
  activityDedupeKey,
} from "@/lib/activity/plan-activity-emission";
import type { EvaluationResult, MemberDecision } from "@/lib/activity/evaluate-meeting";

const FAMILY = "cmfamily";
const CHANNEL = "123456789012345678";
const MEETING = "meeting-1";

function decision(over: Partial<MemberDecision> = {}): MemberDecision {
  return {
    discordId: "u1",
    name: "Membre Un",
    playtimeMinutes: 0,
    thresholdApplied: 300,
    consecutiveZeroMeetings: 3,
    daysSinceBankLog: 40,
    isInactive: true,
    isLow: true,
    inactiveCycles: 1,
    emit: [],
    clear: [],
    reasons: [],
    ...over,
  };
}

function evaluation(over: Partial<EvaluationResult> = {}): EvaluationResult {
  return {
    evaluated: true,
    meetingId: MEETING,
    medianMinutes: 200,
    baselineMedian: 210,
    atypical: false,
    decisions: [decision()],
    toEmit: [],
    heldLow: null,
    ...over,
  };
}

describe("planActivityEmission — clé de déduplication", () => {
  it("est stable pour une même réunion et un même type", () => {
    const args = { familyId: FAMILY, discordId: "u1", kind: "INACTIVE" as const, meetingId: MEETING };
    expect(activityDedupeKey(args)).toBe(activityDedupeKey(args));
    expect(activityDedupeKey(args)).toBe(
      `activity:${FAMILY}:u1:ACTIVITY_ALERT_INACTIVE:${MEETING}`
    );
  });

  it("diffère par type et par réunion", () => {
    const base = { familyId: FAMILY, discordId: "u1", meetingId: MEETING };
    expect(activityDedupeKey({ ...base, kind: "INACTIVE" })).not.toBe(
      activityDedupeKey({ ...base, kind: "LOW" })
    );
    expect(activityDedupeKey({ ...base, kind: "INACTIVE" })).not.toBe(
      activityDedupeKey({ ...base, kind: "INACTIVE", meetingId: "autre" })
    );
  });
});

describe("planActivityEmission — règles d'émission", () => {
  it("produit un job par alerte, sur le salon fourni", () => {
    const plan = planActivityEmission({
      evaluation: evaluation({
        decisions: [decision({ emit: ["INACTIVE"] })],
        toEmit: [{ discordId: "u1", kind: "INACTIVE" }],
      }),
      familyId: FAMILY,
      channelId: CHANNEL,
    });
    expect(plan.jobs).toHaveLength(1);
    expect(plan.jobs[0].channelId).toBe(CHANNEL);
    expect(plan.jobs[0].embeds).toHaveLength(1);
    expect(plan.jobs[0].dedupeKey).toContain("ACTIVITY_ALERT_INACTIVE");
  });

  it("n'émet AUCUN job LOW quand le relevé est atypique", () => {
    const plan = planActivityEmission({
      evaluation: evaluation({
        atypical: true,
        medianMinutes: 1,
        decisions: [decision({ emit: ["LOW"] })],
        // Seconde barrière : même si le moteur laissait passer un LOW, le plan
        // doit le retenir.
        toEmit: [{ discordId: "u1", kind: "LOW" }],
        heldLow: {
          meetingId: MEETING,
          medianMinutes: 1,
          baselineMedian: 210,
          discordIds: ["u1"],
          heldAt: "2026-08-09T19:00:00.000Z",
        },
      }),
      familyId: FAMILY,
      channelId: CHANNEL,
    });
    expect(plan.jobs).toHaveLength(0);
  });

  it("RECOMMEND_KICK est une notification, pas une action", () => {
    const plan = planActivityEmission({
      evaluation: evaluation({
        decisions: [decision({ emit: ["RECOMMEND_KICK"], inactiveCycles: 2 })],
        toEmit: [{ discordId: "u1", kind: "RECOMMEND_KICK" }],
      }),
      familyId: FAMILY,
      channelId: CHANNEL,
    });
    // Le plan ne contient qu'un message : aucun champ ne permet d'exprimer un
    // kick, un retrait de rôle ou une action LYG.
    expect(plan.jobs).toHaveLength(1);
    expect(Object.keys(plan.jobs[0])).toEqual(
      expect.arrayContaining(["dedupeKey", "channelId", "embeds"])
    );
    expect(JSON.stringify(plan.jobs[0])).not.toMatch(/kick.?(user|member)|removeRole|lyg/i);
  });

  it("remonte les levées de drapeau sans créer de job", () => {
    const plan = planActivityEmission({
      evaluation: evaluation({
        decisions: [decision({ isInactive: false, isLow: false, clear: ["INACTIVE", "LOW"] })],
        toEmit: [],
      }),
      familyId: FAMILY,
      channelId: CHANNEL,
    });
    expect(plan.jobs).toHaveLength(0);
    expect(plan.clears).toEqual([
      { discordId: "u1", kind: "INACTIVE" },
      { discordId: "u1", kind: "LOW" },
    ]);
  });

  it("ne planifie rien pour une réunion déjà évaluée", () => {
    const plan = planActivityEmission({
      evaluation: evaluation({ evaluated: false, toEmit: [], decisions: [] }),
      familyId: FAMILY,
      channelId: CHANNEL,
    });
    expect(plan.jobs).toHaveLength(0);
    expect(plan.clears).toHaveLength(0);
  });
});

// ── Corps transactionnel, avec un faux client ───────────────────────────────
//
// Le faux `tx` reproduit ce qui compte : `createMany` renvoie le nombre de
// lignes RÉELLEMENT insérées (les doublons étant ignorés par
// `ON CONFLICT DO NOTHING`), et peut échouer pour simuler une panne.
const savedStates: any[] = [];
vi.mock("@/lib/activity-legacy", async () => {
  const actual = await vi.importActual<any>("@/lib/activity-legacy");
  return {
    ...actual,
    saveFamilyActivityState: vi.fn(async (_tx: any, _f: string, _a: string, state: any) => {
      savedStates.push(JSON.parse(JSON.stringify(state)));
    }),
  };
});

const { applyActivityEmission } = await import("@/lib/activity/apply-activity-emission");

function fakeTx(createMany: (args: any) => Promise<{ count: number }>) {
  return { discordOutbox: { createMany: vi.fn(createMany) } } as any;
}

function freshState(): any {
  return { version: 1, members: {}, actions: [] };
}

function inactiveScenario() {
  const evalResult = evaluation({
    decisions: [decision({ emit: ["INACTIVE"] })],
    toEmit: [{ discordId: "u1", kind: "INACTIVE" }],
  });
  return {
    evaluation: evalResult,
    plan: planActivityEmission({ evaluation: evalResult, familyId: FAMILY, channelId: CHANNEL }),
  };
}

describe("applyActivityEmission — garantie transactionnelle", () => {
  it("succès normal : job inséré PUIS lastAlerted posé", async () => {
    savedStates.length = 0;
    const state = freshState();
    const tx = fakeTx(async () => ({ count: 1 }));

    const res = await applyActivityEmission({
      tx, familyId: FAMILY, actorId: "actor", state,
      ...inactiveScenario(),
      now: new Date("2026-08-09T19:00:00.000Z"),
    });

    expect(res.jobsCreated).toBe(1);
    expect(res.jobsAlreadyPresent).toBe(0);
    expect(state.members.u1.lastAlerted.inactive).toBe(true);
    expect(state.lastEvaluatedMeetingId).toBe(MEETING);
    expect(savedStates).toHaveLength(1);
  });

  it("job déjà présent : ON CONFLICT DO NOTHING, drapeau posé quand même", async () => {
    // count=0 alors qu'un job était planifié : la clé existait déjà, donc
    // l'effet est garanti. Ne pas poser le drapeau condamnerait à retenter.
    savedStates.length = 0;
    const state = freshState();
    const tx = fakeTx(async () => ({ count: 0 }));

    const res = await applyActivityEmission({
      tx, familyId: FAMILY, actorId: "actor", state,
      ...inactiveScenario(),
      now: new Date("2026-08-09T19:00:00.000Z"),
    });

    expect(res.jobsCreated).toBe(0);
    expect(res.jobsAlreadyPresent).toBe(1);
    expect(state.members.u1.lastAlerted.inactive).toBe(true);
    expect(state.lastEvaluatedMeetingId).toBe(MEETING);
  });

  it("l'insertion utilise skipDuplicates (sinon la transaction avorterait)", async () => {
    // Régression : une boucle de `create` avec rattrapage du P2002 abandonne
    // la transaction en PostgreSQL (25P02). Constaté en test réel.
    const state = freshState();
    const tx = fakeTx(async () => ({ count: 1 }));
    await applyActivityEmission({
      tx, familyId: FAMILY, actorId: "actor", state,
      ...inactiveScenario(),
      now: new Date("2026-08-09T19:00:00.000Z"),
    });
    expect(tx.discordOutbox.createMany).toHaveBeenCalledTimes(1);
    expect(tx.discordOutbox.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });

  it("erreur Outbox : rien n'est sauvegardé, aucun lastEvaluatedMeetingId", async () => {
    savedStates.length = 0;
    const state = freshState();
    const tx = fakeTx(async () => {
      throw new Error("panne Outbox");
    });

    await expect(
      applyActivityEmission({
        tx, familyId: FAMILY, actorId: "actor", state,
        ...inactiveScenario(),
        now: new Date("2026-08-09T19:00:00.000Z"),
      })
    ).rejects.toThrow("panne Outbox");

    expect(savedStates).toHaveLength(0);
    expect(state.lastEvaluatedMeetingId).toBeUndefined();
    expect(state.members.u1).toBeUndefined();
  });

  it("aucune alerte : aucun appel Outbox, état tout de même persisté", async () => {
    savedStates.length = 0;
    const state = freshState();
    const evalResult = evaluation({ decisions: [decision({ emit: [] })], toEmit: [] });
    const tx = fakeTx(async () => ({ count: 0 }));

    await applyActivityEmission({
      tx, familyId: FAMILY, actorId: "actor", state,
      evaluation: evalResult,
      plan: planActivityEmission({ evaluation: evalResult, familyId: FAMILY, channelId: CHANNEL }),
      now: new Date("2026-08-09T19:00:00.000Z"),
    });

    expect(tx.discordOutbox.createMany).not.toHaveBeenCalled();
    expect(state.members.u1.inactiveCycles).toBe(1);
    expect(state.lastEvaluatedMeetingId).toBe(MEETING);
  });
});
