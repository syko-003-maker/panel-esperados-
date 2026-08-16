/**
 * Évaluation de l'activité, au moment de la finalisation d'une réunion.
 *
 * Fonction PURE : aucune dépendance à Prisma, Discord ou LYG. Toutes les
 * données entrent par les paramètres, le résultat est déterministe. C'est ce
 * qui la rend testable hors ligne — et c'est délibéré : la logique métier de
 * l'activité n'a jamais tourné en production, elle doit être vérifiable sans
 * rien déclencher.
 *
 * Ce module NE décide QUE. Il n'écrit pas l'état, n'envoie aucun message et ne
 * met aucun job en file. L'appelant est responsable de persister le résultat.
 *
 * ── Règles (validées le 11/08/2026, à partir de 21 réunions d'historique) ────
 *
 *   INACTIVE        3 réunions consécutives à playtime 0
 *                   ET aucune opération bancaire depuis plus de 21 jours.
 *                   La banque ne peut que DISCULPER : une opération récente
 *                   annule l'inactivité, son absence ne la prouve pas.
 *
 *   LOW             playtime < seuil individuel du membre, sinon < 300.
 *                   Un seuil individuel à 0 vaut exemption explicite.
 *
 *   RECOMMEND_KICK  2 évaluations consécutives en état inactif.
 *                   Recommandation au staff — jamais d'exclusion automatique.
 *
 * ── Garde-fou « relevé atypique » ───────────────────────────────────────────
 *
 * Si la médiane des playtimes de la réunion est < 10 min, le relevé est jugé
 * atypique et les alertes LOW sont RETENUES au lieu d'être émises. Mesuré sur
 * l'historique : 2 réunions sur 21 (médianes 0 et 1, la suivante étant à 39).
 *
 * INACTIVE et RECOMMEND_KICK ne sont jamais retenus : ils exigent déjà trois
 * réunions et un contrôle bancaire, donc une réunion isolée ne peut pas les
 * déclencher à tort.
 */

/** Seuil de playtime hebdomadaire quand le membre n'a pas de dérogation. */
export const DEFAULT_FAMILY_PLAYTIME_THRESHOLD = 300;
/** Réunions consécutives à 0 avant de considérer l'inactivité. */
export const INACTIVE_ZERO_MEETINGS = 3;
/** Jours sans opération bancaire au-delà desquels la banque ne disculpe plus. */
export const INACTIVE_BANK_SILENCE_DAYS = 21;
/** Évaluations inactives consécutives avant de recommander l'exclusion. */
export const RECOMMEND_KICK_CYCLES = 2;
/** En dessous de cette médiane, le relevé de la réunion est jugé atypique. */
export const ATYPICAL_MEDIAN_MINUTES = 10;
/** Nombre de réunions précédentes servant de référence à la médiane. */
export const BASELINE_MEETINGS = 4;

export type MeetingPlaytimeRow = {
  discordId: string;
  playtimeMinutes: number;
};

export type MeetingHistoryEntry = {
  meetingId: string;
  /** Ordre chronologique croissant attendu de l'appelant. */
  meetingDate: string;
  rows: MeetingPlaytimeRow[];
};

export type EvaluationMember = {
  discordId: string;
  name?: string | null;
  /** Dérogation individuelle. `0` = exempté de la règle de playtime. */
  playtimeRequiredMinutes?: number | null;
  /** Date ISO de la dernière opération bancaire connue, si elle existe. */
  lastBankLogAt?: string | null;
  /** Exemption temporaire posée par le staff (date ISO de fin). */
  exemptUntil?: string | null;
  /** Compteur d'évaluations inactives consécutives, issu de l'état persisté. */
  inactiveCycles?: number;
  /** Ce qui a DÉJÀ été alerté, pour n'émettre que sur transition. */
  alreadyAlerted?: {
    inactive?: boolean;
    lowPlaytime?: boolean;
    recommendKick?: boolean;
  };
};

export type EvaluationInput = {
  /** Réunion à évaluer. */
  meeting: MeetingHistoryEntry;
  /** Réunions PRÉCÉDENTES, ordre chronologique croissant, la plus récente en dernier. */
  history: MeetingHistoryEntry[];
  members: EvaluationMember[];
  /** Réunion déjà évaluée, issue de l'état persisté. */
  lastEvaluatedMeetingId?: string | null;
  /** Horodatage de l'évaluation. Injecté pour rendre les tests déterministes. */
  now: Date;
};

export type AlertKind = "INACTIVE" | "LOW" | "RECOMMEND_KICK";

export type MemberDecision = {
  discordId: string;
  name?: string | null;
  playtimeMinutes: number | null;
  /** Seuil réellement appliqué (individuel s'il existe, sinon familial). */
  thresholdApplied: number;
  consecutiveZeroMeetings: number;
  daysSinceBankLog: number | null;
  isInactive: boolean;
  isLow: boolean;
  inactiveCycles: number;
  /** Alertes à émettre maintenant. Vide si rien ne change. */
  emit: AlertKind[];
  /** Alertes dont le drapeau doit être levé (retour à la normale). */
  clear: AlertKind[];
  /** Motif lisible de chaque décision, pour l'audit et le digest. */
  reasons: string[];
};

export type EvaluationResult = {
  /** `false` quand la réunion a déjà été évaluée : rien à écrire, rien à émettre. */
  evaluated: boolean;
  skippedReason?: "already_evaluated";
  meetingId: string;
  medianMinutes: number;
  baselineMedian: number;
  /** Médiane < 10 : les LOW sont retenus au lieu d'être émis. */
  atypical: boolean;
  decisions: MemberDecision[];
  /** Alertes réellement à mettre en file. */
  toEmit: Array<{ discordId: string; kind: AlertKind }>;
  /** Lot LOW retenu, seulement si la réunion est atypique. */
  heldLow: {
    meetingId: string;
    medianMinutes: number;
    baselineMedian: number;
    discordIds: string[];
    heldAt: string;
  } | null;
};

/** Médiane entière d'une série. 0 sur série vide — une réunion sans ligne est atypique. */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const raw =
    sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return Math.round(raw);
}

/**
 * Nombre de réunions consécutives à 0 en terminant par la réunion évaluée.
 *
 * S'arrête au premier playtime non nul. Une réunion où le membre est ABSENT du
 * relevé n'est pas comptée comme un zéro : on ne peut pas conclure d'une
 * absence de ligne.
 */
function countConsecutiveZeros(
  discordId: string,
  meeting: MeetingHistoryEntry,
  history: MeetingHistoryEntry[]
): number {
  const chronological = [...history, meeting];
  let streak = 0;
  for (let i = chronological.length - 1; i >= 0; i -= 1) {
    const row = chronological[i].rows.find((r) => r.discordId === discordId);
    if (!row) break;
    if (row.playtimeMinutes > 0) break;
    streak += 1;
  }
  return streak;
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

export function evaluateMeetingActivity(input: EvaluationInput): EvaluationResult {
  const { meeting, history, members, now } = input;

  // Idempotence : refinaliser la même réunion ne doit rien produire.
  if (input.lastEvaluatedMeetingId && input.lastEvaluatedMeetingId === meeting.meetingId) {
    return {
      evaluated: false,
      skippedReason: "already_evaluated",
      meetingId: meeting.meetingId,
      medianMinutes: 0,
      baselineMedian: 0,
      atypical: false,
      decisions: [],
      toEmit: [],
      heldLow: null,
    };
  }

  const medianMinutes = median(meeting.rows.map((r) => r.playtimeMinutes));
  const baselineMedian = median(
    history
      .slice(-BASELINE_MEETINGS)
      .flatMap((m) => m.rows.map((r) => r.playtimeMinutes))
  );
  const atypical = medianMinutes < ATYPICAL_MEDIAN_MINUTES;

  const decisions: MemberDecision[] = [];
  const toEmit: Array<{ discordId: string; kind: AlertKind }> = [];
  const heldDiscordIds: string[] = [];

  for (const member of members) {
    const row = meeting.rows.find((r) => r.discordId === member.discordId);
    const playtimeMinutes = row ? row.playtimeMinutes : null;
    const already = member.alreadyAlerted ?? {};
    const reasons: string[] = [];
    const emit: AlertKind[] = [];
    const clear: AlertKind[] = [];

    const exempt =
      member.exemptUntil != null && new Date(member.exemptUntil).getTime() > now.getTime();

    const threshold =
      typeof member.playtimeRequiredMinutes === "number"
        ? member.playtimeRequiredMinutes
        : DEFAULT_FAMILY_PLAYTIME_THRESHOLD;

    const consecutiveZeroMeetings = countConsecutiveZeros(member.discordId, meeting, history);

    const daysSinceBankLog = member.lastBankLogAt
      ? daysBetween(new Date(member.lastBankLogAt), now)
      : null;

    // La banque disculpe : une opération récente annule l'inactivité. Son
    // absence totale (null) ne disculpe pas — le membre n'a peut-être jamais
    // utilisé la banque.
    const bankSilent =
      daysSinceBankLog === null || daysSinceBankLog > INACTIVE_BANK_SILENCE_DAYS;

    const isInactive =
      !exempt && consecutiveZeroMeetings >= INACTIVE_ZERO_MEETINGS && bankSilent;

    // Un seuil individuel à 0 vaut exemption explicite de la règle de playtime.
    const lowApplicable = !exempt && threshold > 0 && playtimeMinutes !== null;
    const isLow = lowApplicable && playtimeMinutes! < threshold;

    if (exempt) reasons.push("Exempté (exemption temporaire)");
    if (threshold === 0) reasons.push("Seuil individuel à 0 — exempté de la règle de playtime");

    // ── INACTIVE ────────────────────────────────────────────────────────────
    let inactiveCycles = member.inactiveCycles ?? 0;
    if (isInactive) {
      inactiveCycles += 1;
      reasons.push(
        `Inactif : ${consecutiveZeroMeetings} réunions à 0` +
          (daysSinceBankLog === null
            ? ", aucune opération bancaire connue"
            : `, dernière opération bancaire il y a ${daysSinceBankLog} j`)
      );
      if (!already.inactive) emit.push("INACTIVE");
    } else {
      if (consecutiveZeroMeetings >= INACTIVE_ZERO_MEETINGS && !bankSilent) {
        reasons.push(
          `Disculpé par la banque : opération il y a ${daysSinceBankLog} j (≤ ${INACTIVE_BANK_SILENCE_DAYS})`
        );
      }
      inactiveCycles = 0;
      if (already.inactive) clear.push("INACTIVE");
      if (already.recommendKick) clear.push("RECOMMEND_KICK");
    }

    // ── RECOMMEND_KICK ──────────────────────────────────────────────────────
    // Recommandation au staff uniquement : aucune exclusion, aucun retrait de
    // rôle, aucune action LYG n'est décidée ici.
    if (isInactive && inactiveCycles >= RECOMMEND_KICK_CYCLES && !already.recommendKick) {
      emit.push("RECOMMEND_KICK");
      reasons.push(`${inactiveCycles} cycles inactifs consécutifs — exclusion recommandée au staff`);
    }

    // ── LOW ─────────────────────────────────────────────────────────────────
    if (isLow) {
      reasons.push(`Playtime ${playtimeMinutes} min < seuil ${threshold} min`);
      if (!already.lowPlaytime) {
        if (atypical) {
          heldDiscordIds.push(member.discordId);
          reasons.push(`LOW retenu : relevé atypique (médiane ${medianMinutes} min)`);
        } else {
          emit.push("LOW");
        }
      }
    } else if (already.lowPlaytime) {
      clear.push("LOW");
    }

    for (const kind of emit) toEmit.push({ discordId: member.discordId, kind });

    decisions.push({
      discordId: member.discordId,
      name: member.name ?? null,
      playtimeMinutes,
      thresholdApplied: threshold,
      consecutiveZeroMeetings,
      daysSinceBankLog,
      isInactive,
      isLow,
      inactiveCycles,
      emit,
      clear,
      reasons,
    });
  }

  return {
    evaluated: true,
    meetingId: meeting.meetingId,
    medianMinutes,
    baselineMedian,
    atypical,
    decisions,
    toEmit,
    heldLow:
      atypical && heldDiscordIds.length > 0
        ? {
            meetingId: meeting.meetingId,
            medianMinutes,
            baselineMedian,
            discordIds: heldDiscordIds,
            heldAt: now.toISOString(),
          }
        : null,
  };
}
