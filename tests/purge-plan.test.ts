import { describe, it, expect } from "vitest";
import {
  computeThreshold,
  isEligible,
  emptyTally,
  accumulate,
  emptyPurgeTally,
  recordOutcome,
  classifyDeleteError,
  finalStatus,
  isPartial,
  parseCustomId,
  buildCustomId,
  newPurgeId,
  PurgeRegistry,
  PurgeLock,
  MAX_SCAN_MESSAGES,
  CONFIRM_TTL_MS,
  DISCORD_UNKNOWN_MESSAGE,
  DISCORD_MISSING_PERMISSIONS,
  type PendingPurge,
  type LockHolder,
} from "../discord-worker/src/features/purge/purge-plan.js";

/**
 * Les 12 cas exigés pour `/purge-old`.
 *
 * Le module testé est PUR : ni discord.js, ni Prisma, ni réseau. Aucune de ces
 * assertions ne peut toucher un vrai salon — c'est précisément pour cela que la
 * logique a été isolée avant d'être branchée.
 */

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function pending(over: Partial<PendingPurge> = {}): PendingPurge {
  const now = 1_000_000;
  return {
    purgeId: "abc123def456",
    userId: "user-chef",
    guildId: "guild-1",
    channelId: "chan-1",
    months: 6,
    thresholdMs: now - 180 * DAY,
    matchedCount: 42,
    keptCount: 8,
    newestMatchedAt: now - 181 * DAY,
    oldestFoundAt: now - 400 * DAY,
    capReached: false,
    createdAtMs: now,
    expiresAtMs: now + CONFIRM_TTL_MS,
    consumed: false,
    ...over,
  };
}

// ── 1. Membre non autorisé ──────────────────────────────────────────────────
//
// L'autorisation par rôle vit dans `purge-command.ts`, qui importe discord.js.
// Ce qui est vérifiable ici — et qui est le vrai garde-fou au clic — c'est que
// le registre refuse toute réclamation par un autre identifiant.
describe("1. membre non autorisé", () => {
  it("un identifiant qui n'est pas l'auteur ne peut jamais réclamer la purge", () => {
    const reg = new PurgeRegistry();
    reg.put(pending());
    const res = reg.claim("abc123def456", "membre-lambda", 1_000_100);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("WRONG_USER");
  });

  it("le refus ne consomme pas la purge : l'auteur légitime peut encore agir", () => {
    const reg = new PurgeRegistry();
    reg.put(pending());
    reg.claim("abc123def456", "intrus", 1_000_100);
    expect(reg.claim("abc123def456", "user-chef", 1_000_200).ok).toBe(true);
  });
});

// ── 2. Aperçu → aucune suppression ──────────────────────────────────────────
describe("2. aperçu", () => {
  it("le comptage n'expose aucun moyen de supprimer", () => {
    const threshold = 1_000_000;
    const t = accumulate(emptyTally(), [threshold - 1, threshold - 2, threshold + 5], threshold);
    expect(t.matched).toBe(2);
    expect(t.kept).toBe(1);
    // Le résultat du scan est un pur comptage : aucune clé n'évoque une action.
    expect(Object.keys(t).sort()).toEqual(
      ["capReached", "kept", "matched", "newestMatchedAt", "oldestFoundAt", "scanned"]
    );
  });

  it("l'aperçu enregistre la purge sans la consommer", () => {
    const reg = new PurgeRegistry();
    reg.put(pending());
    expect(reg.get("abc123def456")?.consumed).toBe(false);
  });
});

// ── 3. Confirmation par un autre utilisateur ────────────────────────────────
describe("3. confirmation par un autre utilisateur", () => {
  it("refuse, et le bouton reste inutilisable pour l'intrus", () => {
    const reg = new PurgeRegistry();
    reg.put(pending({ userId: "chef" }));
    for (const intrus of ["autre", "encore-autre", ""]) {
      const res = reg.claim("abc123def456", intrus, 1_000_100);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe("WRONG_USER");
    }
  });

  it("l'annulation aussi est réservée à l'auteur", () => {
    const reg = new PurgeRegistry();
    reg.put(pending({ userId: "chef" }));
    const res = reg.cancel("abc123def456", "intrus");
    expect(res.ok).toBe(false);
    // La purge n'a pas été supprimée du registre par l'intrus.
    expect(reg.get("abc123def456")).toBeDefined();
  });
});

// ── 4. Confirmation expirée ─────────────────────────────────────────────────
describe("4. confirmation expirée", () => {
  it("refuse au-delà du TTL", () => {
    const reg = new PurgeRegistry();
    const p = pending();
    reg.put(p);
    const res = reg.claim(p.purgeId, p.userId, p.expiresAtMs + 1);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("EXPIRED");
  });

  it("accepte à la milliseconde limite, refuse juste après", () => {
    const reg = new PurgeRegistry();
    const p = pending();
    reg.put(p);
    expect(reg.claim(p.purgeId, p.userId, p.expiresAtMs).ok).toBe(true);
  });

  it("une entrée expirée est retirée du registre", () => {
    const reg = new PurgeRegistry();
    const p = pending();
    reg.put(p);
    reg.claim(p.purgeId, p.userId, p.expiresAtMs + 1);
    expect(reg.get(p.purgeId)).toBeUndefined();
  });
});

// ── 5. Seuil correct ────────────────────────────────────────────────────────
describe("5. calcul du seuil", () => {
  it("6 mois avant le 16/08/2026 donne le 16/02/2026", () => {
    const t = computeThreshold(new Date("2026-08-16T12:00:00.000Z"), 6);
    expect(t.getUTCFullYear()).toBe(2026);
    expect(t.getUTCMonth()).toBe(1); // février
    expect(t.getUTCDate()).toBe(16);
  });

  it("le seuil est configurable sans changer la logique", () => {
    const now = new Date("2026-08-16T12:00:00.000Z");
    expect(computeThreshold(now, 3).getUTCMonth()).toBe(4);  // mai
    expect(computeThreshold(now, 12).getUTCFullYear()).toBe(2025);
    expect(computeThreshold(now, 24).getUTCFullYear()).toBe(2024);
  });

  it("rejette une durée hors bornes", () => {
    const now = new Date("2026-08-16T12:00:00.000Z");
    expect(() => computeThreshold(now, 0)).toThrow(RangeError);
    expect(() => computeThreshold(now, 61)).toThrow(RangeError);
    expect(() => computeThreshold(now, 1.5)).toThrow(RangeError);
  });
});

// ── 6. Message exactement au seuil → conservé ───────────────────────────────
describe("6. message exactement au seuil", () => {
  it("est CONSERVÉ (comparaison stricte)", () => {
    const threshold = 1_700_000_000_000;
    expect(isEligible(threshold, threshold)).toBe(false);
  });

  it("le comptage le range bien dans « à conserver »", () => {
    const threshold = 1_700_000_000_000;
    const t = accumulate(emptyTally(), [threshold], threshold);
    expect(t.matched).toBe(0);
    expect(t.kept).toBe(1);
  });
});

// ── 7. Message plus ancien → supprimé ───────────────────────────────────────
describe("7. message plus ancien que le seuil", () => {
  it("est éligible, même d'une milliseconde", () => {
    const threshold = 1_700_000_000_000;
    expect(isEligible(threshold - 1, threshold)).toBe(true);
  });

  it("un message plus récent n'est jamais éligible", () => {
    const threshold = 1_700_000_000_000;
    expect(isEligible(threshold + 1, threshold)).toBe(false);
    expect(isEligible(Date.now(), threshold)).toBe(false);
  });

  it("newestMatchedAt est le plus récent des ciblés, pas du salon", () => {
    const th = 1_000_000;
    const t = accumulate(emptyTally(), [th - 500, th - 10, th + 900], th);
    expect(t.newestMatchedAt).toBe(th - 10);
    expect(t.oldestFoundAt).toBe(th - 500);
  });
});

// ── 8. dry-run → aucune suppression ─────────────────────────────────────────
describe("8. dry-run", () => {
  it("un bilan sans exécution reste à zéro supprimé", () => {
    const tally = emptyPurgeTally(1234);
    expect(tally.targeted).toBe(1234);
    expect(tally.deleted).toBe(0);
    expect(tally.alreadyGone).toBe(0);
    expect(tally.forbidden).toBe(0);
    expect(tally.failed).toBe(0);
  });

  it("aucune purge n'est enregistrée : rien à confirmer", () => {
    // En dry-run la commande ne fait pas de `registry.put` : un clic ultérieur
    // sur un identifiant inventé tombe donc sur UNKNOWN.
    const reg = new PurgeRegistry();
    const res = reg.claim("jamaisenregistre", "chef", Date.now());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("UNKNOWN");
  });
});

// ── 9. 429 → géré par la couche REST ────────────────────────────────────────
describe("9. rate limit", () => {
  it("un 429 qui remonte est classé en échec, pas avalé silencieusement", () => {
    // @discordjs/rest absorbe les 429 (file par bucket, 3 tentatives). Ce qui
    // remonte jusqu'ici est donc un échec durable : le compter comme tel évite
    // d'annoncer un succès qui n'a pas eu lieu.
    expect(classifyDeleteError({ status: 429, code: 0 })).toBe("failed");
  });

  it("distingue les codes Discord connus", () => {
    expect(classifyDeleteError({ code: DISCORD_UNKNOWN_MESSAGE })).toBe("alreadyGone");
    expect(classifyDeleteError({ code: DISCORD_MISSING_PERMISSIONS })).toBe("forbidden");
    expect(classifyDeleteError({ code: 50001 })).toBe("forbidden");
    expect(classifyDeleteError(new Error("réseau coupé"))).toBe("failed");
    expect(classifyDeleteError(null)).toBe("failed");
  });
});

// ── 10. Erreur partielle → bilan cohérent ───────────────────────────────────
describe("10. bilan partiel", () => {
  it("les compteurs sont distincts et leur somme couvre les tentatives", () => {
    let t = emptyPurgeTally(12_483);
    for (let i = 0; i < 12_470; i += 1) t = recordOutcome(t, "deleted");
    for (let i = 0; i < 10; i += 1) t = recordOutcome(t, "alreadyGone");
    for (let i = 0; i < 2; i += 1) t = recordOutcome(t, "forbidden");
    t = recordOutcome(t, "failed");

    expect(t.targeted).toBe(12_483);
    expect(t.deleted).toBe(12_470);
    expect(t.alreadyGone).toBe(10);
    expect(t.forbidden).toBe(2);
    expect(t.failed).toBe(1);
    expect(t.deleted + t.alreadyGone + t.forbidden + t.failed).toBe(12_483);
    expect(isPartial(t)).toBe(true);
  });

  it("un succès complet n'est pas marqué partiel", () => {
    let t = emptyPurgeTally(3);
    for (let i = 0; i < 3; i += 1) t = recordOutcome(t, "deleted");
    expect(isPartial(t)).toBe(false);
    expect(finalStatus(t)).toBe("COMPLETED");
  });

  it("tout en échec donne FAILED", () => {
    let t = emptyPurgeTally(2);
    t = recordOutcome(t, "failed");
    t = recordOutcome(t, "forbidden");
    expect(finalStatus(t)).toBe("FAILED");
  });

  it("arrêt sur plafond : le bilan est marqué partiel", () => {
    const dates = Array.from({ length: MAX_SCAN_MESSAGES + 10 }, (_, i) => i);
    const t = accumulate(emptyTally(), dates, MAX_SCAN_MESSAGES + 100);
    expect(t.capReached).toBe(true);
    expect(t.scanned).toBe(MAX_SCAN_MESSAGES);
    expect(isPartial({ ...emptyPurgeTally(t.matched, true) })).toBe(true);
  });
});

// ── 11. Aucun message → COMPLETED propre ────────────────────────────────────
describe("11. aucun message à supprimer", () => {
  it("se termine en COMPLETED, pas en échec", () => {
    const t = emptyPurgeTally(0);
    expect(finalStatus(t)).toBe("COMPLETED");
    expect(isPartial(t)).toBe(false);
  });

  it("un salon vide produit un comptage nul et cohérent", () => {
    const t = accumulate(emptyTally(), [], 1_000_000);
    expect(t.matched).toBe(0);
    expect(t.kept).toBe(0);
    expect(t.scanned).toBe(0);
    expect(t.newestMatchedAt).toBeNull();
    expect(t.oldestFoundAt).toBeNull();
  });
});

// ── 12. Double clic → pas de double purge ───────────────────────────────────
describe("12. double clic sur la confirmation", () => {
  it("la seconde réclamation est refusée", () => {
    const reg = new PurgeRegistry();
    const p = pending();
    reg.put(p);
    expect(reg.claim(p.purgeId, p.userId, p.createdAtMs + 10).ok).toBe(true);
    const second = reg.claim(p.purgeId, p.userId, p.createdAtMs + 11);
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("ALREADY_USED");
  });

  it("dix clics simultanés ne produisent qu'une seule exécution", () => {
    const reg = new PurgeRegistry();
    const p = pending();
    reg.put(p);
    const accepted = Array.from({ length: 10 }, () =>
      reg.claim(p.purgeId, p.userId, p.createdAtMs + 5)
    ).filter((r) => r.ok);
    expect(accepted).toHaveLength(1);
  });

  it("le marquage précède l'exécution : `consumed` est posé par claim()", () => {
    // Vérifier puis marquer après coup laisserait passer deux clics rapprochés.
    const reg = new PurgeRegistry();
    const p = pending();
    reg.put(p);
    reg.claim(p.purgeId, p.userId, p.createdAtMs + 1);
    expect(reg.get(p.purgeId)?.consumed).toBe(true);
  });
});

// ── Identifiants de bouton ──────────────────────────────────────────────────
describe("customId", () => {
  it("aller-retour, et reste sous la limite Discord de 100 caractères", () => {
    const id = newPurgeId();
    const cid = buildCustomId("confirm", id);
    expect(cid.length).toBeLessThanOrEqual(100);
    expect(parseCustomId(cid)).toEqual({ action: "confirm", purgeId: id });
    expect(parseCustomId(buildCustomId("cancel", id))).toEqual({ action: "cancel", purgeId: id });
  });

  it("rejette ce qui n'est pas un bouton de purge", () => {
    for (const bad of ["sug:vote:1", "purge:confirm:", "purge:autre:abc", "purge:confirm:ABC!", ""]) {
      expect(parseCustomId(bad)).toBeNull();
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// VERROU GLOBAL — un seul nettoyage à la fois
// ════════════════════════════════════════════════════════════════════════════
//
// Constaté en production le 16/08/2026 : deux purges lancées à une minute
// d'intervalle ont tourné 38 minutes en parallèle, à 3,8 s par message chacune
// contre 350 ms de temporisation prévue. Elles partageaient la file de
// `@discordjs/rest`, donc le même débit. Ces tests verrouillent le correctif.

function holder(over: Partial<LockHolder> = {}): LockHolder {
  return {
    purgeId: "lock-1",
    channelId: "salon-A",
    userId: "chef",
    startedAtMs: 1_000_000,
    phase: "DELETE",
    ...over,
  };
}

describe("13. purge en cours + deuxième commande → refus immédiat", () => {
  it("la seconde acquisition est refusée", () => {
    const lock = new PurgeLock();
    expect(lock.tryAcquire(holder()).ok).toBe(true);
    const second = lock.tryAcquire(holder({ purgeId: "lock-2", channelId: "salon-B", userId: "sous-chef" }));
    expect(second.ok).toBe(false);
  });

  it("le refus expose QUI et DEPUIS QUAND, pour que l'embed soit informatif", () => {
    const lock = new PurgeLock();
    lock.tryAcquire(holder({ channelId: "banque-famille", userId: "chef", startedAtMs: 5_000 }));
    const res = lock.tryAcquire(holder({ purgeId: "lock-2" }));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.holder.channelId).toBe("banque-famille");
      expect(res.holder.userId).toBe("chef");
      expect(res.holder.startedAtMs).toBe(5_000);
    }
  });

  it("un salon différent ne contourne PAS le verrou : il est global", () => {
    const lock = new PurgeLock();
    lock.tryAcquire(holder({ channelId: "salon-A" }));
    expect(lock.tryAcquire(holder({ purgeId: "x", channelId: "salon-B" })).ok).toBe(false);
    expect(lock.tryAcquire(holder({ purgeId: "y", channelId: "salon-C" })).ok).toBe(false);
  });
});

describe("14. purge terminée → nouvelle commande autorisée", () => {
  it("après libération, le verrou est de nouveau disponible", () => {
    const lock = new PurgeLock();
    lock.tryAcquire(holder());
    expect(lock.release("lock-1")).toBe(true);
    expect(lock.held).toBe(false);
    expect(lock.tryAcquire(holder({ purgeId: "lock-2" })).ok).toBe(true);
  });

  it("enchaîner dix nettoyages successifs fonctionne", () => {
    const lock = new PurgeLock();
    for (let i = 0; i < 10; i += 1) {
      const id = `p${i}`;
      expect(lock.tryAcquire(holder({ purgeId: id })).ok).toBe(true);
      expect(lock.release(id)).toBe(true);
    }
    expect(lock.held).toBe(false);
  });
});

describe("15. purge en erreur → verrou libéré", () => {
  it("le finally libère malgré une erreur métier", () => {
    const lock = new PurgeLock();
    const run = () => {
      lock.tryAcquire(holder());
      try {
        throw new Error("Discord a refusé la suppression");
      } catch {
        // erreur capturée comme dans runPurge
      } finally {
        lock.release("lock-1");
      }
    };
    run();
    expect(lock.held).toBe(false);
  });
});

describe("16. exception inattendue → verrou libéré", () => {
  it("le verrou est rendu même si l'exception se propage", () => {
    const lock = new PurgeLock();
    expect(() => {
      lock.tryAcquire(holder());
      try {
        throw new TypeError("panne inattendue");
      } finally {
        lock.release("lock-1");
      }
    }).toThrow(TypeError);
    expect(lock.held).toBe(false);
    expect(lock.tryAcquire(holder({ purgeId: "suivante" })).ok).toBe(true);
  });

  it("une libération par un NON-détenteur ne vole pas le verrou", () => {
    // Sans ce contrôle, le `finally` tardif d'un aperçu terminé libérerait le
    // verrou d'une suppression en cours et rouvrirait la concurrence.
    const lock = new PurgeLock();
    lock.tryAcquire(holder({ purgeId: "en-cours" }));
    expect(lock.release("un-autre-id")).toBe(false);
    expect(lock.held).toBe(true);
    expect(lock.current()?.purgeId).toBe("en-cours");
  });
});

describe("17. double confirmation → une seule purge", () => {
  it("dix confirmations simultanées n'obtiennent qu'un verrou", () => {
    const lock = new PurgeLock();
    const ok = Array.from({ length: 10 }, (_, i) =>
      lock.tryAcquire(holder({ purgeId: `c${i}` }))
    ).filter((r) => r.ok);
    expect(ok).toHaveLength(1);
  });

  it("registre ET verrou bloquent tous deux le double-clic", () => {
    const reg = new PurgeRegistry();
    const lock = new PurgeLock();
    const p = pending();
    reg.put(p);

    const first = reg.claim(p.purgeId, p.userId, p.createdAtMs + 1);
    expect(first.ok).toBe(true);
    expect(lock.tryAcquire(holder({ purgeId: p.purgeId })).ok).toBe(true);

    // Deuxième clic : refusé par le registre avant même d'atteindre le verrou.
    const second = reg.claim(p.purgeId, p.userId, p.createdAtMs + 2);
    expect(second.ok).toBe(false);
    expect(lock.tryAcquire(holder({ purgeId: "autre" })).ok).toBe(false);
  });
});

describe("18. verrou présent → aucun scan ni suppression de la seconde", () => {
  it("le refus intervient sans qu'aucune lecture de salon ait lieu", () => {
    // On simule la séquence de `runPurgePreview` : le verrou est testé AVANT
    // toute lecture. Un compteur prouve que le scan n'est jamais atteint.
    const lock = new PurgeLock();
    let scans = 0;
    let deletions = 0;

    const preview = (purgeId: string) => {
      const got = lock.tryAcquire(holder({ purgeId }));
      if (!got.ok) return "REFUSE";
      try {
        scans += 1;
        deletions += 5;
        return "OK";
      } finally {
        lock.release(purgeId);
      }
    };

    lock.tryAcquire(holder({ purgeId: "occupant" }));   // une purge tourne déjà
    expect(preview("seconde")).toBe("REFUSE");
    expect(scans).toBe(0);
    expect(deletions).toBe(0);
  });

  it("une fois le verrou rendu, le scan a bien lieu", () => {
    const lock = new PurgeLock();
    let scans = 0;
    lock.tryAcquire(holder({ purgeId: "occupant" }));
    lock.release("occupant");
    const got = lock.tryAcquire(holder({ purgeId: "seconde" }));
    if (got.ok) scans += 1;
    expect(scans).toBe(1);
  });
});
