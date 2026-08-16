import { describe, it, expect } from "vitest";
import { normalizeState } from "@/lib/activity-legacy";

/**
 * Ces tests protègent une propriété facile à casser : `normalizeState`
 * reconstruit un objet à partir d'une liste EXPLICITE de champs. Tout champ
 * ajouté au type mais oublié dans le normaliseur est silencieusement perdu au
 * chargement — sans erreur, sans log.
 *
 * Concrètement, sans `inactiveCycles` recopié, le compteur repart à 0 à chaque
 * lecture et `RECOMMEND_KICK` (2 cycles) devient inatteignable.
 */
describe("normalizeState — persistance des champs d'évaluation", () => {
  it("préserve inactiveCycles au niveau membre", () => {
    const state = normalizeState({
      version: 1,
      members: { u1: { discordId: "u1", inactiveCycles: 3 } },
    });
    expect(state.members?.u1.inactiveCycles).toBe(3);
  });

  it("préserve lastEvaluatedMeetingId", () => {
    const state = normalizeState({ version: 1, lastEvaluatedMeetingId: "meeting-42" });
    expect(state.lastEvaluatedMeetingId).toBe("meeting-42");
  });

  it("préserve heldLow avec tous ses champs", () => {
    const state = normalizeState({
      version: 1,
      heldLow: {
        meetingId: "m1",
        medianMinutes: 1,
        baselineMedian: 152,
        discordIds: ["u1", "u2"],
        heldAt: "2026-08-09T19:00:00.000Z",
      },
    });
    expect(state.heldLow).toEqual({
      meetingId: "m1",
      medianMinutes: 1,
      baselineMedian: 152,
      discordIds: ["u1", "u2"],
      heldAt: "2026-08-09T19:00:00.000Z",
    });
  });

  it("survit à un aller-retour JSON complet", () => {
    const original = normalizeState({
      version: 1,
      lastEvaluatedMeetingId: "m9",
      members: { u1: { discordId: "u1", inactiveCycles: 2 } },
      heldLow: {
        meetingId: "m9",
        medianMinutes: 0,
        baselineMedian: 400,
        discordIds: ["u1"],
        heldAt: "2026-08-09T19:00:00.000Z",
      },
    });
    const roundTripped = normalizeState(JSON.parse(JSON.stringify(original)));

    // On compare les champs porteurs de sens plutôt que l'objet entier :
    // `normalizeState` n'est pas idempotent sur `lastAlerted` (`{}` au premier
    // passage, trois booléens à `false` au second). Asymétrie PRÉEXISTANTE,
    // sémantiquement neutre — les deux formes signifient « rien n'a été
    // alerté ». La signaler ici évite qu'un futur test la prenne pour une
    // régression.
    expect(roundTripped.lastEvaluatedMeetingId).toBe(original.lastEvaluatedMeetingId);
    expect(roundTripped.heldLow).toEqual(original.heldLow);
    expect(roundTripped.members?.u1.inactiveCycles).toBe(
      original.members?.u1.inactiveCycles
    );
  });
});

describe("normalizeState — compatibilité avec les anciens états version 1", () => {
  it("un état sans les nouveaux champs reste valide", () => {
    const state = normalizeState({
      version: 1,
      lastSyncAt: "2026-05-01T10:00:00.000Z",
      members: { u1: { discordId: "u1", playtimeMinutes: 120 } },
      actions: [],
    });
    expect(state.version).toBe(1);
    expect(state.members?.u1.playtimeMinutes).toBe(120);
    expect(state.lastEvaluatedMeetingId).toBeUndefined();
    expect(state.heldLow).toBeUndefined();
  });

  it("inactiveCycles absent vaut 0, pas undefined", () => {
    // 0 signifie « aucun cycle inactif observé » : c'est la valeur juste pour
    // un état antérieur à la fonctionnalité, et elle rend le compteur
    // directement utilisable sans test de nullité côté appelant.
    const state = normalizeState({ version: 1, members: { u1: { discordId: "u1" } } });
    expect(state.members?.u1.inactiveCycles).toBe(0);
  });

  it("un état vide ou absent ne casse pas", () => {
    expect(normalizeState(null).version).toBe(1);
    expect(normalizeState(undefined).heldLow).toBeUndefined();
    expect(normalizeState({}).lastEvaluatedMeetingId).toBeUndefined();
  });
});

describe("normalizeState — robustesse de heldLow", () => {
  it("écarte un lot sans meetingId", () => {
    const state = normalizeState({
      version: 1,
      heldLow: { medianMinutes: 1, discordIds: ["u1"] },
    });
    expect(state.heldLow).toBeUndefined();
  });

  it("écarte un lot sans aucun membre", () => {
    const state = normalizeState({
      version: 1,
      heldLow: { meetingId: "m1", discordIds: [] },
    });
    expect(state.heldLow).toBeUndefined();
  });

  it("nettoie les identifiants vides et normalise les nombres manquants", () => {
    const state = normalizeState({
      version: 1,
      heldLow: { meetingId: "m1", discordIds: ["u1", "", "  ", "u2"] },
    });
    expect(state.heldLow?.discordIds).toEqual(["u1", "u2"]);
    expect(state.heldLow?.medianMinutes).toBe(0);
    expect(state.heldLow?.baselineMedian).toBe(0);
  });

  it("refuse un inactiveCycles négatif ou non numérique", () => {
    const state = normalizeState({
      version: 1,
      members: {
        u1: { discordId: "u1", inactiveCycles: -5 },
        u2: { discordId: "u2", inactiveCycles: "trois" },
      },
    });
    expect(state.members?.u1.inactiveCycles).toBe(0);
    expect(state.members?.u2.inactiveCycles).toBe(0);
  });
});
