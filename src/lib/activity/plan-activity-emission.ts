import { buildActivityAlertEmbed } from "@/lib/discord/outbox-embeds";
import type { DiscordEmbedPayload } from "@/lib/discord/discord";
import type { AlertKind, EvaluationResult } from "@/lib/activity/evaluate-meeting";

/**
 * Traduit des décisions d'évaluation en jobs Outbox à créer.
 *
 * Fonction PURE : aucune base, aucun Discord. C'est elle qui décide QUOI
 * envoyer et sous quelle clé de déduplication — la partie transactionnelle se
 * contente ensuite d'exécuter ce plan.
 *
 * Séparer ainsi permet de tester la totalité des règles d'émission (rétention
 * des LOW, clé de dédup, absence de doublon) sans monter une base.
 *
 * Le mécanisme d'envoi réutilise `SEND_MESSAGE` : l'embed est construit ici,
 * côté panel, et le worker n'a rien de nouveau à connaître. Il bénéficie donc
 * du retry et de l'idempotence par nonce déjà en place, plutôt que de cinq
 * handlers à écrire et à maintenir.
 */

export type PlannedAlertJob = {
  discordId: string;
  kind: AlertKind;
  /** Clé UNIQUE en base : c'est elle qui rend la création idempotente. */
  dedupeKey: string;
  channelId: string;
  embeds: DiscordEmbedPayload[];
  entityId: string;
};

export type EmissionPlan = {
  jobs: PlannedAlertJob[];
  /** Drapeaux à lever (retour à la normale), indépendants de toute émission. */
  clears: Array<{ discordId: string; kind: AlertKind }>;
};

/**
 * `activity:{famille}:{membre}:{type}:{réunion}`
 *
 * La réunion, plutôt qu'une date : rejouer la finalisation d'une même réunion
 * retombe sur la même clé, donc sur un `P2002` — donc sur aucun doublon.
 */
export function activityDedupeKey(params: {
  familyId: string;
  discordId: string;
  kind: AlertKind;
  meetingId: string;
}): string {
  return `activity:${params.familyId}:${params.discordId}:ACTIVITY_ALERT_${params.kind}:${params.meetingId}`;
}

const EMBED_TYPE_BY_KIND: Record<AlertKind, Parameters<typeof buildActivityAlertEmbed>[0]["type"]> = {
  INACTIVE: "ACTIVITY_ALERT_INACTIVE",
  LOW: "ACTIVITY_ALERT_LOW",
  RECOMMEND_KICK: "ACTIVITY_ALERT_RECOMMEND_KICK",
};

export function planActivityEmission(params: {
  evaluation: EvaluationResult;
  familyId: string;
  channelId: string;
}): EmissionPlan {
  const { evaluation, familyId, channelId } = params;

  if (!evaluation.evaluated) return { jobs: [], clears: [] };

  const decisionByDiscordId = new Map(evaluation.decisions.map((d) => [d.discordId, d]));
  const jobs: PlannedAlertJob[] = [];

  for (const { discordId, kind } of evaluation.toEmit) {
    const decision = decisionByDiscordId.get(discordId);
    if (!decision) continue;

    // Les LOW d'une réunion atypique ne sont jamais émis : ils vivent dans
    // `heldLow` en attendant une confirmation humaine. `evaluateMeetingActivity`
    // les exclut déjà de `toEmit` ; cette garde est une seconde barrière, pour
    // qu'un futur changement du moteur ne les laisse pas passer en silence.
    if (kind === "LOW" && evaluation.atypical) continue;

    jobs.push({
      discordId,
      kind,
      dedupeKey: activityDedupeKey({
        familyId,
        discordId,
        kind,
        meetingId: evaluation.meetingId,
      }),
      channelId,
      entityId: discordId,
      embeds: [
        buildActivityAlertEmbed({
          type: EMBED_TYPE_BY_KIND[kind],
          discordId,
          name: decision.name,
          playtimeMinutes: decision.playtimeMinutes,
          // `RECOMMEND_KICK` reste une NOTIFICATION : l'embed formule une
          // recommandation, aucune exclusion n'est déclenchée nulle part.
          suggestedAction: kind === "RECOMMEND_KICK" ? "RECOMMEND_KICK" : null,
          inactiveDays: null,
          lastSeenAt: null,
        }) as DiscordEmbedPayload,
      ],
    });
  }

  const clears = evaluation.decisions.flatMap((d) =>
    d.clear.map((kind) => ({ discordId: d.discordId, kind }))
  );

  return { jobs, clears };
}
