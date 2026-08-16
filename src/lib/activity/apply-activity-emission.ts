import type { PrismaClientLike } from "@/lib/discord/discord";
import { getMemberState, saveFamilyActivityState } from "@/lib/activity-legacy";
import type { LegacyActivityState } from "@/lib/activity-legacy";
import type { EvaluationResult } from "@/lib/activity/evaluate-meeting";
import type { EmissionPlan } from "@/lib/activity/plan-activity-emission";

/**
 * Corps transactionnel de l'émission des alertes d'activité.
 *
 * Le client est injecté (`tx`), ce qui rend la fonction testable avec un faux
 * client — indispensable pour vérifier le `P2002` et le rollback sans base.
 *
 * ── L'invariant que cette fonction garantit ─────────────────────────────────
 *
 * Une alerte ne peut JAMAIS être marquée comme annoncée sans qu'un job existe.
 * L'ordre est strict :
 *
 *     job créé (ou déjà présent)  →  ALORS lastAlerted = true
 *
 * et les deux écritures partagent la même transaction. Si le commit échoue,
 * le job et le drapeau disparaissent ensemble : c'est PostgreSQL qui tient
 * l'invariant, pas une convention de code.
 *
 * L'ordre inverse — `lastAlerted` puis envoi — perdrait définitivement une
 * alerte à la moindre panne entre les deux : l'évaluation suivante la croirait
 * déjà annoncée.
 */
export async function applyActivityEmission(params: {
  tx: PrismaClientLike;
  familyId: string;
  actorId: string;
  state: LegacyActivityState;
  evaluation: EvaluationResult;
  plan: EmissionPlan;
  now: Date;
}): Promise<{ jobsCreated: number; jobsAlreadyPresent: number }> {
  const { tx, familyId, actorId, state, evaluation, plan, now } = params;
  const nowIso = now.toISOString();

  // ── 3 et 4. Les jobs d'abord ────────────────────────────────────────────
  //
  // `createMany({ skipDuplicates: true })` et NON une boucle de `create` avec
  // rattrapage du P2002.
  //
  // Pourquoi : en PostgreSQL, une contrainte violée à l'intérieur d'une
  // transaction ABANDONNE toute la transaction. Attraper le P2002 en TypeScript
  // ne la ressuscite pas — chaque commande suivante échoue en 25P02
  // (« current transaction is aborted »). Le motif « avaler le P2002 et
  // continuer », parfaitement valable hors transaction, casse ici.
  //
  // Constaté en test isolé le 15/08/2026 : le rejeu d'une évaluation avec des
  // `dedupeKey` déjà présents faisait échouer tout le bloc.
  //
  // `skipDuplicates` se traduit par `ON CONFLICT DO NOTHING` : le conflit est
  // absorbé par PostgreSQL lui-même, sans erreur, donc sans abandon.
  const insert =
    plan.jobs.length > 0
      ? await tx.discordOutbox.createMany({
          data: plan.jobs.map((job) => ({
            familyId,
            type: "SEND_MESSAGE" as const,
            status: "PENDING" as const,
            channelId: job.channelId,
            dedupeKey: job.dedupeKey,
            entity: "activity",
            entityId: job.entityId,
            meta: { embeds: job.embeds } as any,
          })),
          skipDuplicates: true,
        })
      : { count: 0 };

  // Après cet appel, TOUTE clé planifiée existe en base — qu'elle vienne d'être
  // insérée ou qu'elle fût déjà là. L'effet est donc garanti dans les deux cas,
  // ce qui autorise à poser les drapeaux.
  const jobsCreated = insert.count;
  const jobsAlreadyPresent = plan.jobs.length - insert.count;

  // ── 5. Les drapeaux, seulement maintenant ──────────────────────────────
  for (const job of plan.jobs) {
    const memberState = getMemberState(state, job.discordId);
    if (!memberState.lastAlerted) memberState.lastAlerted = {};
    if (!memberState.lastAlertAt) memberState.lastAlertAt = {};
    if (job.kind === "INACTIVE") memberState.lastAlerted.inactive = true;
    if (job.kind === "LOW") memberState.lastAlerted.lowPlaytime = true;
    if (job.kind === "RECOMMEND_KICK") memberState.lastAlerted.recommendKick = true;
    memberState.lastAlertAt[job.kind] = nowIso;
  }

  // ── 6. Les levées de drapeau ────────────────────────────────────────────
  // Un retour à la normale n'a pas de job associé : rien à garantir, on
  // applique directement.
  for (const { discordId, kind } of plan.clears) {
    const memberState = getMemberState(state, discordId);
    if (!memberState.lastAlerted) memberState.lastAlerted = {};
    if (kind === "INACTIVE") memberState.lastAlerted.inactive = false;
    if (kind === "LOW") memberState.lastAlerted.lowPlaytime = false;
    if (kind === "RECOMMEND_KICK") memberState.lastAlerted.recommendKick = false;
  }

  // ── 7. Les faits observés ───────────────────────────────────────────────
  for (const decision of evaluation.decisions) {
    const memberState = getMemberState(state, decision.discordId);
    memberState.playtimeMinutes = decision.playtimeMinutes;
    memberState.inactiveCycles = decision.inactiveCycles;
  }
  state.heldLow = evaluation.heldLow ?? undefined;
  state.lastSyncAt = nowIso;

  // ── 8. En dernier ───────────────────────────────────────────────────────
  // Si quoi que ce soit échoue avant, la transaction est annulée et la réunion
  // reste non évaluée : elle sera reprise intégralement.
  state.lastEvaluatedMeetingId = evaluation.meetingId;

  // ── 9. Sauvegarde ───────────────────────────────────────────────────────
  await saveFamilyActivityState(tx, familyId, actorId, state);

  return { jobsCreated, jobsAlreadyPresent };
}
