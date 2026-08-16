import "server-only";
import { prisma } from "@/lib/db";
import { getMemberState, loadFamilyActivityState } from "@/lib/activity-legacy";
import { planActivityEmission } from "@/lib/activity/plan-activity-emission";
import { applyActivityEmission } from "@/lib/activity/apply-activity-emission";
import { isActiveMembersScopeMember } from "@/lib/staff/member-scope";
import {
  evaluateMeetingActivity,
  BASELINE_MEETINGS,
  type EvaluationMember,
  type EvaluationResult,
  type MeetingHistoryEntry,
} from "@/lib/activity/evaluate-meeting";

/**
 * Orchestration de l'évaluation d'activité à la finalisation d'une réunion.
 *
 * Ce module fait le pont entre la base et la fonction pure
 * `evaluateMeetingActivity` : il charge, il appelle, il persiste.
 *
 * Ce qu'il NE fait PAS, volontairement à ce stade :
 *   - aucun message Discord, aucun job Outbox, aucune action LYG ;
 *   - aucun kick, aucun retrait de rôle ;
 *   - aucune écriture hors de l'état d'activité lui-même.
 *
 * Le calcul et la persistance doivent être validés avant qu'un quelconque
 * effet visible soit branché. Le résultat renvoyé contient déjà tout ce qu'il
 * faudra émettre plus tard (`toEmit`), mais personne ne le consomme encore.
 */

/** Nombre de réunions chargées en plus de celle évaluée. */
const HISTORY_DEPTH = 12;

export type RunMeetingEvaluationResult =
  | {
      ok: true;
      evaluation: EvaluationResult;
      persisted: boolean;
      jobsCreated?: number;
      jobsAlreadyPresent?: number;
    }
  | {
      ok: false;
      reason:
        | "meeting_not_found"
        | "meeting_not_finalized"
        | "ACTIVITY_CHANNEL_NOT_CONFIGURED";
    };

/**
 * Charge les N dernières réunions finalisées de la famille, la plus ancienne
 * en premier — l'ordre attendu par `evaluateMeetingActivity`.
 *
 * On remonte plus loin que les 3 réunions strictement nécessaires au critère
 * d'inactivité : la médiane de référence en consomme 4, et disposer de marge
 * évite d'avoir à recharger si les constantes évoluent.
 */
async function loadMeetingHistory(
  familyId: string,
  beforeDate: Date,
  limit: number
): Promise<MeetingHistoryEntry[]> {
  const meetings = await prisma.meeting.findMany({
    where: { familyId, finalizedAt: { not: null }, meetingDate: { lt: beforeDate } },
    orderBy: { meetingDate: "desc" },
    take: limit,
    select: {
      id: true,
      meetingDate: true,
      rows: {
        select: { discordIdSnapshot: true, playtimeMinutes: true },
      },
    },
  });

  return meetings
    .map((m) => ({
      meetingId: m.id,
      meetingDate: m.meetingDate.toISOString(),
      // Une ligne sans Discord ni playtime ne peut pas être rattachée à un
      // membre : on l'écarte plutôt que de la compter comme un zéro.
      rows: m.rows
        .filter((r) => r.discordIdSnapshot && typeof r.playtimeMinutes === "number")
        .map((r) => ({
          discordId: String(r.discordIdSnapshot),
          playtimeMinutes: r.playtimeMinutes as number,
        })),
    }))
    .reverse();
}

/**
 * Dernière opération bancaire par membre.
 *
 * Requête unique groupée : une par membre coûterait 40 allers-retours à chaque
 * finalisation. La banque ne sert qu'à DISCULPER — une opération récente annule
 * l'inactivité, son absence ne la prouve pas.
 */
async function loadLastBankLogBySteamId(
  familyId: string,
  steamIds: string[]
): Promise<Map<string, string>> {
  if (steamIds.length === 0) return new Map();
  const rows = await prisma.bankLog.groupBy({
    by: ["steamId"],
    where: { familyId, steamId: { in: steamIds } },
    _max: { at: true },
  });
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.steamId && row._max.at) map.set(row.steamId, row._max.at.toISOString());
  }
  return map;
}

export async function runMeetingActivityEvaluation(params: {
  meetingId: string;
  familyId: string;
  actorId: string;
  now?: Date;
}): Promise<RunMeetingEvaluationResult> {
  const now = params.now ?? new Date();

  const meeting = await prisma.meeting.findUnique({
    where: { id: params.meetingId },
    select: {
      id: true,
      familyId: true,
      meetingDate: true,
      finalizedAt: true,
      rows: { select: { discordIdSnapshot: true, playtimeMinutes: true } },
    },
  });
  if (!meeting) return { ok: false, reason: "meeting_not_found" };
  // L'évaluation n'a de sens que sur un relevé arrêté.
  if (!meeting.finalizedAt) return { ok: false, reason: "meeting_not_finalized" };

  const state = await loadFamilyActivityState(prisma, params.familyId);

  // Sortie immédiate si la réunion a déjà été traitée : on ne recharge rien
  // d'autre et on n'écrit pas. C'est ce qui rend une refinalisation inoffensive.
  if (state.lastEvaluatedMeetingId === meeting.id) {
    return {
      ok: true,
      persisted: false,
      evaluation: evaluateMeetingActivity({
        meeting: { meetingId: meeting.id, meetingDate: meeting.meetingDate.toISOString(), rows: [] },
        history: [],
        members: [],
        lastEvaluatedMeetingId: state.lastEvaluatedMeetingId,
        now,
      }),
    };
  }

  const history = await loadMeetingHistory(
    params.familyId,
    meeting.meetingDate,
    Math.max(HISTORY_DEPTH, BASELINE_MEETINGS)
  );

  const dbMembers = await prisma.member.findMany({
    where: { familyId: params.familyId, isActive: true, isGhost: false },
    select: {
      discordId: true,
      steamId: true,
      rpName: true,
      isActive: true,
      isGhost: true,
      discordRoleIds: true,
      discordInGuild: true,
      discordLastError: true,
      missingFromLygSince: true,
      playtimeRequiredMinutes: true,
    },
  });

  // Même périmètre que le reste du staff : masqués, partis et statuts
  // particuliers (démote, blacklist, réserviste) sont hors évaluation.
  const scoped = dbMembers.filter(
    (m) => m.discordId && isActiveMembersScopeMember(m as any)
  );

  const bankBySteamId = await loadLastBankLogBySteamId(
    params.familyId,
    scoped.map((m) => m.steamId).filter((s): s is string => Boolean(s))
  );

  const members: EvaluationMember[] = scoped.map((m) => {
    const discordId = String(m.discordId);
    const memberState = getMemberState(state, discordId);
    return {
      discordId,
      name: m.rpName,
      playtimeRequiredMinutes: m.playtimeRequiredMinutes,
      lastBankLogAt: m.steamId ? bankBySteamId.get(m.steamId) ?? null : null,
      exemptUntil: memberState.exemptUntil ?? null,
      inactiveCycles: memberState.inactiveCycles ?? 0,
      alreadyAlerted: {
        inactive: Boolean(memberState.lastAlerted?.inactive),
        lowPlaytime: Boolean(memberState.lastAlerted?.lowPlaytime),
        recommendKick: Boolean(memberState.lastAlerted?.recommendKick),
      },
    };
  });

  const evaluation = evaluateMeetingActivity({
    meeting: {
      meetingId: meeting.id,
      meetingDate: meeting.meetingDate.toISOString(),
      rows: meeting.rows
        .filter((r) => r.discordIdSnapshot && typeof r.playtimeMinutes === "number")
        .map((r) => ({
          discordId: String(r.discordIdSnapshot),
          playtimeMinutes: r.playtimeMinutes as number,
        })),
    },
    history,
    members,
    lastEvaluatedMeetingId: state.lastEvaluatedMeetingId ?? null,
    now,
  });

  if (!evaluation.evaluated) return { ok: true, evaluation, persisted: false };

  // ── Salon de destination ──────────────────────────────────────────────────
  // Exigé uniquement s'il y a quelque chose à envoyer : sans alerte, aucun job
  // ne serait créé de toute façon, et bloquer la persistance des faits observés
  // n'apporterait rien.
  //
  // S'il manque alors qu'une alerte doit partir : on sort AVANT toute écriture.
  // Rien n'est persisté, donc la réunion sera reprise une fois le salon
  // configuré — plutôt que de créer un job voué à l'échec, ce qui est
  // exactement la panne muette qu'on élimine partout ailleurs.
  const channelId = (
    await prisma.discordConfig.findFirst({
      where: { familyId: params.familyId },
      select: { activityLogChannelId: true },
    })
  )?.activityLogChannelId?.trim();

  if (evaluation.toEmit.length > 0 && !channelId) {
    return { ok: false, reason: "ACTIVITY_CHANNEL_NOT_CONFIGURED" };
  }

  // ── Préparation, hors transaction ─────────────────────────────────────────
  const plan = planActivityEmission({
    evaluation,
    familyId: params.familyId,
    channelId: channelId ?? "",
  });

  // ── Transaction unique : jobs + état ──────────────────────────────────────
  // Une erreur ici annule TOUT — aucun job partiel, aucun `lastAlerted`,
  // aucun `lastEvaluatedMeetingId`.
  const applied = await prisma.$transaction((tx) =>
    applyActivityEmission({
      tx,
      familyId: params.familyId,
      actorId: params.actorId,
      state,
      evaluation,
      plan,
      now,
    })
  );

  return { ok: true, evaluation, persisted: true, ...applied };
}
