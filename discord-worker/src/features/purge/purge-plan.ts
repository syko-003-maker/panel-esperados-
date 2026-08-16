/**
 * Purge des anciens messages — logique PURE.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE EXISTE SÉPARÉMENT
 * ────────────────────────────────────────────────────────────────────────────
 * Aucun import de discord.js ici. C'est ce qui rend la totalité des règles
 * — seuil, éligibilité, autorisation du clic, comptabilité du bilan —
 * vérifiable sans monter un client Discord ni toucher un vrai salon.
 *
 * La configuration Vitest exclut `discord-worker/**` de la COLLECTE des tests,
 * mais un test placé dans `tests/` peut parfaitement IMPORTER ce fichier :
 * l'exclusion ne filtre que les fichiers de test eux-mêmes. Vérifié.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LE FAIT QUI DÉTERMINE TOUTE LA CONCEPTION
 * ────────────────────────────────────────────────────────────────────────────
 * `bulkDelete` de discord.js est plafonné à `MaxBulkDeletableMessageAge`, soit
 * exactement 1 209 600 000 ms = 14 jours (Constants.js:9). Avec `filterOld`,
 * les messages plus vieux sont retirés du lot ; sans lui, l'API rejette le lot
 * entier. Une purge à 6 mois ne peut donc RIEN supprimer en masse : chaque
 * message part individuellement. C'est lent, et c'est assumé.
 */

/** Statuts du cycle de vie d'une purge, tracés dans l'AuditLog. */
export type PurgeStatus =
  | "PREVIEW"
  | "CONFIRMED"
  | "RUNNING"
  | "COMPLETED"
  | "CANCELED"
  | "FAILED";

/** Bornes de l'option `age`, en mois. */
export const MIN_AGE_MONTHS = 1;
export const MAX_AGE_MONTHS = 60;

/**
 * Plafond de balayage. Au-delà, on s'arrête proprement et on le DIT : mieux
 * vaut un bilan honnêtement partiel qu'une commande qui tourne sans fin.
 */
export const MAX_SCAN_MESSAGES = 50_000;

/** Durée de validité d'une confirmation. Le jeton d'interaction vit 15 min. */
export const CONFIRM_TTL_MS = 5 * 60_000;

/** Espacement des messages de progression dans #logs. */
export const PROGRESS_INTERVAL_MS = 60_000;

/**
 * Calcule le seuil : tout message STRICTEMENT antérieur est éligible.
 *
 * Le calcul est refait à la confirmation, donc `now` est injecté plutôt que lu
 * dans la fonction — c'est aussi ce qui le rend testable.
 */
export function computeThreshold(now: Date, months: number): Date {
  if (!Number.isInteger(months) || months < MIN_AGE_MONTHS || months > MAX_AGE_MONTHS) {
    throw new RangeError(`age doit être un entier entre ${MIN_AGE_MONTHS} et ${MAX_AGE_MONTHS} mois`);
  }
  const t = new Date(now.getTime());
  t.setMonth(t.getMonth() - months);
  return t;
}

/**
 * Un message est éligible s'il est STRICTEMENT antérieur au seuil.
 *
 * L'égalité conserve : un message pile au seuil n'est PAS supprimé. Sur une
 * action irréversible, le doute profite à la conservation.
 */
export function isEligible(createdAt: number, threshold: number): boolean {
  return createdAt < threshold;
}

export type ScanTally = {
  matched: number;
  kept: number;
  scanned: number;
  newestMatchedAt: number | null;
  oldestFoundAt: number | null;
  capReached: boolean;
};

export function emptyTally(): ScanTally {
  return { matched: 0, kept: 0, scanned: 0, newestMatchedAt: null, oldestFoundAt: null, capReached: false };
}

/**
 * Intègre un lot de dates de création au comptage.
 *
 * `newestMatchedAt` sert à l'aperçu : c'est la date du message le plus récent
 * qui SERAIT supprimé, donc le repère qui permet de vérifier d'un coup d'œil
 * que le seuil ne mord pas trop près du présent.
 */
export function accumulate(tally: ScanTally, createdAts: number[], threshold: number): ScanTally {
  const next: ScanTally = { ...tally };
  for (const at of createdAts) {
    if (next.scanned >= MAX_SCAN_MESSAGES) {
      next.capReached = true;
      break;
    }
    next.scanned += 1;
    if (next.oldestFoundAt === null || at < next.oldestFoundAt) next.oldestFoundAt = at;
    if (isEligible(at, threshold)) {
      next.matched += 1;
      if (next.newestMatchedAt === null || at > next.newestMatchedAt) next.newestMatchedAt = at;
    } else {
      next.kept += 1;
    }
  }
  if (next.scanned >= MAX_SCAN_MESSAGES) next.capReached = true;
  return next;
}

// ── Registre des purges en attente de confirmation ──────────────────────────

export type PendingPurge = {
  purgeId: string;
  userId: string;
  guildId: string;
  channelId: string;
  months: number;
  thresholdMs: number;
  matchedCount: number;
  keptCount: number;
  newestMatchedAt: number | null;
  oldestFoundAt: number | null;
  capReached: boolean;
  createdAtMs: number;
  expiresAtMs: number;
  /** Passe à true dès la PREMIÈRE confirmation acceptée. */
  consumed: boolean;
};

export type ClaimRefusal =
  | "UNKNOWN"      // purgeId inconnu — bouton d'une autre session, ou worker redémarré
  | "EXPIRED"      // TTL dépassé
  | "WRONG_USER"   // quelqu'un d'autre a cliqué
  | "ALREADY_USED"; // double-clic, ou rejeu

export type ClaimResult =
  | { ok: true; pending: PendingPurge }
  | { ok: false; reason: ClaimRefusal };

/**
 * Registre en mémoire. Un redémarrage du worker invalide les confirmations en
 * attente — c'est le comportement voulu : une purge doit être décidée et
 * confirmée dans la même fenêtre, pas reprise à l'aveugle.
 */
export class PurgeRegistry {
  private readonly entries = new Map<string, PendingPurge>();

  put(pending: PendingPurge): void {
    this.entries.set(pending.purgeId, pending);
  }

  get(purgeId: string): PendingPurge | undefined {
    return this.entries.get(purgeId);
  }

  /**
   * Tente de réclamer une purge pour exécution.
   *
   * L'ORDRE des contrôles compte, et le marquage `consumed` intervient AVANT
   * que quoi que ce soit ne soit supprimé : c'est lui, et lui seul, qui rend un
   * double-clic inoffensif. Vérifier puis marquer après coup laisserait deux
   * clics rapprochés passer tous les deux.
   */
  claim(purgeId: string, userId: string, nowMs: number): ClaimResult {
    const pending = this.entries.get(purgeId);
    if (!pending) return { ok: false, reason: "UNKNOWN" };
    if (nowMs > pending.expiresAtMs) {
      this.entries.delete(purgeId);
      return { ok: false, reason: "EXPIRED" };
    }
    if (pending.userId !== userId) return { ok: false, reason: "WRONG_USER" };
    if (pending.consumed) return { ok: false, reason: "ALREADY_USED" };

    pending.consumed = true;
    return { ok: true, pending };
  }

  /** Annulation explicite : seul l'auteur peut annuler sa propre purge. */
  cancel(purgeId: string, userId: string): ClaimResult {
    const pending = this.entries.get(purgeId);
    if (!pending) return { ok: false, reason: "UNKNOWN" };
    if (pending.userId !== userId) return { ok: false, reason: "WRONG_USER" };
    this.entries.delete(purgeId);
    return { ok: true, pending };
  }

  /** Purge du registre lui-même, pour éviter une fuite mémoire lente. */
  sweep(nowMs: number): number {
    let removed = 0;
    for (const [id, p] of this.entries) {
      if (nowMs > p.expiresAtMs) {
        this.entries.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  get size(): number {
    return this.entries.size;
  }
}

// ── Comptabilité de l'exécution ─────────────────────────────────────────────

/**
 * Les issues d'une tentative de suppression, distinguées parce qu'elles
 * n'appellent pas la même lecture :
 *   · `alreadyGone` est normal (le message a disparu entre l'aperçu et l'acte) ;
 *   · `forbidden` signale un problème de permission à corriger ;
 *   · `failed` est le reste, à investiguer.
 */
export type DeleteOutcome = "deleted" | "alreadyGone" | "forbidden" | "failed";

export type PurgeTally = {
  targeted: number;
  deleted: number;
  alreadyGone: number;
  forbidden: number;
  failed: number;
  capReached: boolean;
};

export function emptyPurgeTally(targeted: number, capReached = false): PurgeTally {
  return { targeted, deleted: 0, alreadyGone: 0, forbidden: 0, failed: 0, capReached };
}

export function recordOutcome(tally: PurgeTally, outcome: DeleteOutcome): PurgeTally {
  const next = { ...tally };
  next[outcome] += 1;
  return next;
}

/** Codes d'erreur Discord qu'on sait interpréter. */
export const DISCORD_UNKNOWN_MESSAGE = 10008;
export const DISCORD_MISSING_PERMISSIONS = 50013;
export const DISCORD_MISSING_ACCESS = 50001;

/**
 * Traduit une erreur de suppression en issue comptable.
 *
 * Un 429 n'apparaît PAS ici : `@discordjs/rest` l'absorbe lui-même (file par
 * bucket, respect des en-têtes `X-RateLimit-*`, 3 tentatives). Une erreur qui
 * remonte jusqu'à nous après un 429 est donc un échec durable, pas un signal de
 * cadence — écrire notre propre backoff ici entrerait en concurrence avec celui
 * de la bibliothèque et aggraverait la situation.
 */
export function classifyDeleteError(err: unknown): DeleteOutcome {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === DISCORD_UNKNOWN_MESSAGE) return "alreadyGone";
  if (code === DISCORD_MISSING_PERMISSIONS || code === DISCORD_MISSING_ACCESS) return "forbidden";
  return "failed";
}

/**
 * Statut terminal déduit du bilan.
 *
 * Un salon sans rien à supprimer se termine en COMPLETED : ne rien avoir à
 * faire est un succès, pas un échec.
 */
export function finalStatus(tally: PurgeTally): PurgeStatus {
  if (tally.targeted === 0) return "COMPLETED";
  if (tally.deleted === 0 && (tally.failed > 0 || tally.forbidden > 0)) return "FAILED";
  return "COMPLETED";
}

/** Le bilan est-il partiel, et pourquoi ? */
export function isPartial(tally: PurgeTally): boolean {
  return tally.capReached || tally.forbidden > 0 || tally.failed > 0;
}

/** Identifiant court, suffisant pour un customId (limite Discord : 100 car.). */
export function newPurgeId(random: () => number = Math.random): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 12; i += 1) {
    out += alphabet[Math.floor(random() * alphabet.length)];
  }
  return out;
}

export const CUSTOM_ID_PREFIX = "purge:";

export function buildCustomId(action: "confirm" | "cancel", purgeId: string): string {
  return `${CUSTOM_ID_PREFIX}${action}:${purgeId}`;
}

export function parseCustomId(customId: string): { action: "confirm" | "cancel"; purgeId: string } | null {
  const m = /^purge:(confirm|cancel):([a-z0-9]{1,32})$/.exec(customId);
  if (!m) return null;
  return { action: m[1] as "confirm" | "cancel", purgeId: m[2] };
}

// ── Verrou global : un seul nettoyage à la fois ─────────────────────────────

/**
 * Un unique nettoyage peut tourner sur toute l'instance.
 *
 * POURQUOI GLOBAL, ET NON PAR SALON
 * ─────────────────────────────────
 * Les boucles de suppression partagent la file de `@discordjs/rest`, qui
 * sérialise par bucket de rate limit. Deux purges concurrentes ne vont donc pas
 * deux fois plus vite : elles se partagent le même débit et ralentissent
 * chacune. Mesuré en production le 16/08/2026 — deux purges lancées à une
 * minute d'intervalle ont tourné à 3,8 s par message chacune, contre 350 ms de
 * temporisation interne prévue.
 *
 * Un verrou par salon aurait autorisé cette concurrence sans bénéfice. Le
 * verrou global rend en prime la durée annoncée fiable.
 *
 * Sûreté : JavaScript est mono-thread et `tryAcquire` ne contient aucun `await`.
 * La séquence test-puis-pose est donc atomique vis-à-vis des autres tâches —
 * deux confirmations simultanées ne peuvent pas passer toutes les deux.
 */

export type PurgePhase = "SCAN" | "DELETE";

export type LockHolder = {
  purgeId: string;
  channelId: string;
  userId: string;
  startedAtMs: number;
  phase: PurgePhase;
};

export type AcquireResult =
  | { ok: true }
  | { ok: false; holder: LockHolder };

export class PurgeLock {
  private holder: LockHolder | null = null;

  tryAcquire(holder: LockHolder): AcquireResult {
    if (this.holder !== null) return { ok: false, holder: this.holder };
    this.holder = holder;
    return { ok: true };
  }

  /**
   * Ne libère QUE si l'appelant est le détenteur.
   *
   * Sans ce contrôle, un `finally` tardif — celui d'un aperçu terminé après
   * qu'une suppression a pris le verrou — libérerait le verrou d'autrui et
   * rouvrirait la porte à la concurrence qu'on vient de fermer.
   */
  release(purgeId: string): boolean {
    if (this.holder === null || this.holder.purgeId !== purgeId) return false;
    this.holder = null;
    return true;
  }

  current(): LockHolder | null {
    return this.holder;
  }

  get held(): boolean {
    return this.holder !== null;
  }
}
