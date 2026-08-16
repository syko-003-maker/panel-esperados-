/**
 * Rappels de dettes "intelligents".
 *
 * À chaque cycle (manuel ou cron auto), pour chaque débiteur au-dessus du seuil :
 *  - respecte un cooldown PAR MEMBRE (en jours) ;
 *  - se souvient du nb de rappels et du montant au dernier rappel (table
 *    BankDebtReminderState) → détecte si la dette baisse / stagne / augmente ;
 *  - escalade le message (1er doux → 2e ferme → 3e+ dernier avertissement) ;
 *  - au 3e+ rappel SANS réduction, alerte l'État-Major dans le salon staff ;
 *  - remet à zéro le "streak" des membres repassés sous le seuil (ils ont payé).
 */

import { prisma } from "@/lib/db";
import { resolveFamilyId } from "@/lib/family";
import { getOrCreateDiscordConfig, enqueueMessage, enqueueSanctionApply } from "@/lib/discord/discord";
import { getDebtRows } from "@/lib/bank-debts";
import { checkSanctionTargetEligibility, getSanctionLabel, ETAT_MAJOR_ROLE_ID } from "@/lib/sanctions";
import { getSystemActorId, SYSTEM_ACTOR_NAME } from "@/lib/staff/system-actor";

// Démote / Blacklist / Réserviste → pas de rappel (comme le worker single-ping).
const EXCLUDED_ROLE_IDS = ["1340837563753304075", "1338901141873758288", "1312845999366209682"];

const DAY_MS = 24 * 60 * 60 * 1000;

function fmt(amount: number): string {
  return `${Math.abs(Math.round(amount)).toLocaleString("fr-FR")}$`;
}

/**
 * Mouvements de coffre d'un membre depuis son dernier rappel.
 *
 * Comparer deux soldes ne raconte pas ce qui s'est passe : entre deux rappels
 * espaces de plusieurs jours, une dette peut monter a 4 M, etre remboursee,
 * puis remonter. Le bot ne voyait que les extremites et annoncait « ta dette a
 * augmente » a quelqu'un qui venait de rembourser des millions.
 *
 * On lit donc les VRAIS mouvements de la periode. Seuls les mouvements de
 * coffre comptent : le farm (categories production/genetics) n'est pas de
 * l'argent pris a la famille.
 *
 * Une requete par membre relance : leur nombre est limite par le cooldown, et
 * l'alternative (une requete unique avec une date differente par membre) serait
 * nettement plus lourde a lire pour un gain nul a cette echelle.
 */
async function movementsSince(steamId: string | null, since: Date | null) {
  if (!steamId || !since) return null;

  const rows = await prisma.$queryRaw<Array<{ remis: bigint | null; retire: bigint | null }>>`
    SELECT
      SUM(CASE WHEN "type" = 2 THEN "money" ELSE 0 END) AS "remis",
      SUM(CASE WHEN "type" = 1 THEN "money" ELSE 0 END) AS "retire"
    FROM "BankLog"
    WHERE "steamId" = ${steamId}
      AND "at" > ${since}
      AND COALESCE("raw"->>'category', 'bank') = 'bank'
  `;

  const remis = Number(rows[0]?.remis ?? 0);
  const retire = Number(rows[0]?.retire ?? 0);
  if (remis === 0 && retire === 0) return null;
  return { remis, retire };
}

type Trend = "new" | "reduced" | "static" | "increased";

/**
 * Payload d'un message sortant : la mention reste dans `content` (hors embed),
 * sinon Discord ne declenche pas de vraie notification, et le corps part en
 * embed. Meme structure que le ping de dette manuel (BANK_DEBT_PING_SINGLE),
 * pour que les deux se ressemblent dans le salon.
 */
type OutgoingMessage = {
  content: string;
  embed: {
    title: string;
    color: number;
    description: string;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    footer?: { text: string };
    timestamp?: string;
  };
};

/** Couleurs d'escalade : ambre (rappel simple) → orange (relance) → rouge (dernier avertissement). */
const COLOR_SOFT = 0xf59e0b;
const COLOR_FIRM = 0xf97316;
const COLOR_FINAL = 0xef4444;

const TREND_LABEL: Record<Trend, string> = {
  new: "Première alerte",
  reduced: "🟢 En baisse",
  static: "🟠 Inchangée",
  increased: "🔴 En hausse",
};

function memberMessage(params: {
  mention: string;
  amount: number;
  /** Dette au rappel precedent : citee explicitement quand elle a augmente. */
  prevAmount: number;
  /** Mouvements reels depuis le dernier rappel, s'il y en a eu. */
  moves: { remis: number; retire: number } | null;
  count: number;
  trend: Trend;
  daysSinceFirst: number;
  escalateAfter: number;
}): OutgoingMessage {
  const { mention, amount, prevAmount, moves, count, trend, daysSinceFirst, escalateAfter } = params;
  const amt = fmt(amount);
  const isFinal = count >= escalateAfter;

  // Champs communs : ce sont les chiffres que le membre vient verifier. Les
  // sortir du texte les rend lisibles d'un coup d'oeil.
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: "Dette actuelle", value: `**${amt}**`, inline: true },
    { name: "Évolution", value: TREND_LABEL[trend], inline: true },
    { name: "Rappel", value: `n°${count}`, inline: true },
  ];

  // On cite le montant de reference. Sans lui, le membre compare mentalement a
  // son pic historique — qu'il a peut-etre rembourse — et croit le bot en
  // erreur alors qu'il ne compare qu'au dernier rappel.
  if (trend === "increased" && prevAmount > 0) {
    fields.push({ name: "Au rappel précédent", value: fmt(prevAmount), inline: true });
  }
  // Quand on connait les mouvements, on les cite : dire « tu as remis 7 M mais
  // retire 9,6 M » est juste et verifiable, la ou « ta dette a augmente » passe
  // pour une erreur aux yeux de quelqu'un qui a rembourse.
  if (moves) {
    fields.push({
      name: "Mouvements depuis",
      value: `Remis **${fmt(moves.remis)}** · Retiré **${fmt(moves.retire)}**`,
      inline: true,
    });
  }
  if (daysSinceFirst > 0) {
    fields.push({
      name: "Ouverte depuis",
      value: `${daysSinceFirst} jour${daysSinceFirst > 1 ? "s" : ""}`,
      inline: true,
    });
  }

  let title: string;
  let color: number;
  let description: string;

  if (count <= 1) {
    title = "📌 Rappel banque";
    color = COLOR_SOFT;
    description =
      `${mention}, tu es en déficit sur le compte de la famille.\n` +
      `Merci de régulariser dès que possible.`;
  } else if (!isFinal) {
    title = `⚠️ ${count}ᵉ rappel banque`;
    color = COLOR_FIRM;
    description =
      trend === "reduced"
        ? `${mention}, ta dette a baissé mais n'est pas soldée.\nContinue, merci de finir de régulariser.`
        : trend === "increased"
          ? `${mention}, ta dette a **augmenté** depuis le dernier rappel.\nMerci de régulariser rapidement.`
          : `${mention}, ta dette n'a **pas bougé** depuis le dernier rappel.\nMerci de régulariser rapidement.`;
  } else if (trend === "reduced") {
    title = `⚠️ ${count}ᵉ rappel banque`;
    color = COLOR_FIRM;
    description =
      `${mention}, ta dette baisse mais reste ouverte.\n` +
      `Solde-la pour éviter une sanction.`;
  } else {
    title = `🚨 ${count}ᵉ rappel — dernier avertissement`;
    color = COLOR_FINAL;
    description =
      `${mention}, ta dette n'a été ni remboursée ni réduite.\n` +
      `**L'État-Major est informé et pourra sanctionner.**`;
  }

  return {
    content: mention,
    embed: {
      title,
      color,
      description,
      fields,
      footer: { text: "Banque de la famille · rappel automatique" },
      timestamp: new Date().toISOString(),
    },
  };
}

function staffAlertMessage(params: {
  rpName: string | null;
  discordId: string | null;
  amount: number;
  firstAmount: number;
  count: number;
  trend: Trend;
  daysSinceFirst: number;
  staffRoleId: string | null;
  /**
   * Sanction posee automatiquement juste avant, s'il y en a une.
   *
   * Sans cette information, l'alerte reclamait « a traiter (sanction…) » alors
   * que le bot venait d'appliquer un averto : le staff etait invite a
   * sanctionner quelqu'un qui l'etait deja.
   */
  autoSanctionLabel?: string | null;
}): OutgoingMessage {
  const { rpName, discordId, amount, firstAmount, count, trend, daysSinceFirst, staffRoleId, autoSanctionLabel } = params;
  const who = rpName ? `**${rpName}**${discordId ? ` (<@${discordId}>)` : ""}` : discordId ? `<@${discordId}>` : "Membre inconnu";
  const evol =
    trend === "increased"
      ? `🔴 En hausse (+${fmt(Math.max(0, amount - firstAmount))})`
      : "🟠 Stagnante";

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: "Membre", value: who, inline: false },
    { name: "Dette", value: `**${fmt(amount)}**`, inline: true },
    { name: "Évolution", value: evol, inline: true },
    { name: "Signalé", value: `${count} fois`, inline: true },
  ];
  if (daysSinceFirst > 0) {
    fields.push({
      name: "Sans remboursement depuis",
      value: `${daysSinceFirst} jour${daysSinceFirst > 1 ? "s" : ""}`,
      inline: true,
    });
  }
  // Sans cette information, l'alerte reclamait « a traiter (sanction…) » alors
  // que le bot venait d'appliquer un averto : le staff etait invite a
  // sanctionner quelqu'un qui l'etait deja.
  fields.push({
    name: "Suite à donner",
    value: autoSanctionLabel
      ? `Le bot a appliqué **${autoSanctionLabel}** automatiquement — inutile d'en remettre un.\nÀ suivre : relance, arrangement…`
      : "À traiter : sanction, arrangement…",
    inline: false,
  });

  return {
    content: staffRoleId ? `<@&${staffRoleId}>` : "",
    embed: {
      title: "🚨 Débiteur récurrent",
      color: COLOR_FINAL,
      description: "Un membre a dépassé le seuil de rappels sans rembourser.",
      fields,
      footer: { text: "Escalade automatique · rappels de dettes" },
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Échelle disciplinaire, du plus léger au plus lourd. Sert à savoir où en est
 * déjà le membre pour monter d'UN cran, plutôt que de repartir de zéro.
 */
const SANCTION_LADDER = [
  "AVERT_ORAL_PLAYTIME",
  "AVERT_ORAL_REUNION",
  "AVERT_LEGER",
  "AVERT_LOURD",
  "AVERT_EM",
] as const;

/**
 * Sanctions que l'automate a le droit de POSER.
 *
 * S'ARRÊTE VOLONTAIREMENT AVANT LE DÉMOTE : au-delà de l'averto, la décision
 * appartient à l'État-Major. Un cron ne doit jamais rétrograder quelqu'un.
 */
const AUTO_SANCTIONS = ["AVERT_LEGER", "AVERT_LOURD", "AVERT_EM"] as const;

const SANCTION_LABELS: Record<string, string> = {
  AVERT_ORAL_PLAYTIME: "averto oral (playtime)",
  AVERT_ORAL_REUNION: "averto oral (réunion)",
  AVERT_LEGER: "averto léger",
  AVERT_LOURD: "averto lourd",
  AVERT_EM: "averto EM",
};

/** Résultat d'une tentative d'escalade, pour distinguer « plafond atteint »
 *  (→ il faut prévenir l'État-Major) d'un simple « rien à faire ». */
type DebtSanctionOutcome =
  | { kind: "applied"; type: string }
  | { kind: "capped"; highest: string | null }
  | { kind: "skipped" };

/**
 * Détermine la sanction à appliquer, un cran au-dessus de ce que le membre a
 * déjà. Renvoie null quand le plafond est atteint (on ne monte pas plus haut).
 */
export function pickNextSanction(activeTypes: string[], isEtatMajor: boolean): string | null {
  let current = -1;
  for (const type of activeTypes) {
    const index = (SANCTION_LADDER as readonly string[]).indexOf(type);
    if (index > current) current = index;
  }

  for (const candidate of AUTO_SANCTIONS) {
    if ((SANCTION_LADDER as readonly string[]).indexOf(candidate) <= current) continue;
    // L'averto EM est réservé aux membres État-Major. Pour les autres, le cran
    // suivant serait le démote → on s'arrête à l'averto lourd.
    if (candidate === "AVERT_EM" && !isEtatMajor) return null;
    return candidate;
  }

  return null;
}

/**
 * Pose automatiquement la sanction suivante sur un débiteur récidiviste.
 * Renvoie le type appliqué, ou null si le plafond est atteint / membre inéligible.
 */
async function applyDebtSanction(params: {
  familySlug: string;
  familyId: string;
  member: { id: string; discordId: string | null; rpName: string | null; discordRoleIds: unknown };
  amount: number;
  count: number;
}): Promise<DebtSanctionOutcome> {
  const { member } = params;
  if (!member.discordId) return { kind: "skipped" };

  const now = Date.now();
  const active = await prisma.sanction.findMany({
    where: { memberId: member.id, status: "ACTIVE", clearedAt: null },
    select: { type: true, expiresAt: true },
  });

  const activeTypes = active
    .filter((s) => !s.expiresAt || s.expiresAt.getTime() > now)
    .map((s) => String(s.type));

  const roles = Array.isArray(member.discordRoleIds) ? (member.discordRoleIds as string[]) : [];
  const next = pickNextSanction(activeTypes, roles.includes(ETAT_MAJOR_ROLE_ID));

  // Plafond atteint : le cran suivant serait un démote, qui n'appartient pas à
  // l'automate. On remonte l'info pour que l'État-Major tranche.
  const highest = activeTypes
    .filter((t) => (SANCTION_LADDER as readonly string[]).includes(t))
    .sort(
      (a, b) =>
        (SANCTION_LADDER as readonly string[]).indexOf(b) -
        (SANCTION_LADDER as readonly string[]).indexOf(a),
    )[0] ?? null;

  if (!next) return { kind: "capped", highest };

  // Filet : on repasse par le contrôle d'éligibilité officiel plutôt que de se
  // fier au seul calcul ci-dessus (une règle ajoutée plus tard s'appliquera ici).
  if (!checkSanctionTargetEligibility(next, roles).ok) return { kind: "capped", highest };

  const actorId = await getSystemActorId();
  const reason = `Dette non remboursée — ${params.count}ᵉ rappel sans régularisation (${fmt(params.amount)})`;

  const sanction = await prisma.sanction.create({
    data: {
      familyId: params.familyId,
      memberId: member.id,
      discordId: member.discordId,
      type: next as never,
      reason,
      status: "ACTIVE",
      source: "SYSTEM",
      discordStatus: "PENDING",
      createdById: actorId,
    },
  });

  // Application du rôle Discord : sans ça la sanction n'existerait qu'en base.
  await enqueueSanctionApply({
    familyId: params.familySlug,
    sanctionId: sanction.id,
    discordId: member.discordId,
    memberName: member.rpName ?? member.discordId,
    sanctionType: next,
    reason,
    staffName: SYSTEM_ACTOR_NAME,
    appliedByUserId: actorId,
  });

  return { kind: "applied", type: next };
}

/** Alerte spécifique : l'automate est allé au bout, seul un démote reste. */
function demoteDecisionMessage(params: {
  rpName: string | null;
  discordId: string | null;
  amount: number;
  count: number;
  highest: string | null;
  daysSinceFirst: number;
}): OutgoingMessage {
  const who = params.rpName
    ? `**${params.rpName}**${params.discordId ? ` (<@${params.discordId}>)` : ""}`
    : params.discordId
      ? `<@${params.discordId}>`
      : "Membre inconnu";
  const current = params.highest
    ? SANCTION_LABELS[params.highest] ?? params.highest
    : "aucune sanction";

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [
    { name: "Membre", value: who, inline: false },
    { name: "Dette", value: `**${fmt(params.amount)}**`, inline: true },
    { name: "Rappels", value: `${params.count}`, inline: true },
    { name: "Sanction en cours", value: current, inline: true },
  ];
  if (params.daysSinceFirst > 0) {
    fields.push({
      name: "Sans mouvement depuis",
      value: `${params.daysSinceFirst} jour${params.daysSinceFirst > 1 ? "s" : ""}`,
      inline: true,
    });
  }

  return {
    content: `<@&${ETAT_MAJOR_ROLE_ID}>`,
    embed: {
      title: "🔴 Décision requise — escalade épuisée",
      color: COLOR_FINAL,
      description:
        "Le système ne peut pas aller plus loin : le cran suivant serait un " +
        "**démote**, qui relève de votre décision.",
      fields,
      footer: { text: "Escalade automatique · rappels de dettes" },
      timestamp: new Date().toISOString(),
    },
  };
}

export type DebtReminderCycleResult = {
  ok: boolean;
  reason?: string;
  sent: number;
  escalatedToStaff: number;
  autoSanctioned: number;
  demoteDecisionRequested: number;
  paidReset: number;
  skippedCooldown: number;
  skippedIneligible: number;
  debtorCount: number;
};

export async function runDebtReminderCycle(params: {
  familySlug?: string;
  trigger: "manual" | "auto";
  thresholdOverride?: number | null;
}): Promise<DebtReminderCycleResult> {
  const familySlug = params.familySlug ?? "esperados";
  const empty: DebtReminderCycleResult = {
    ok: false,
    sent: 0,
    escalatedToStaff: 0,
    autoSanctioned: 0,
    demoteDecisionRequested: 0,
    paidReset: 0,
    skippedCooldown: 0,
    skippedIneligible: 0,
    debtorCount: 0,
  };

  const config = await getOrCreateDiscordConfig(familySlug);
  if (!config.bankDebtPingEnabled) return { ...empty, reason: "disabled" };
  if (params.trigger === "auto" && !config.bankDebtAutoEnabled) return { ...empty, reason: "auto_disabled" };

  const channelId = config.bankAlertsChannelId;
  if (!channelId) return { ...empty, reason: "no_channel" };
  const staffChannelId = config.bankDebtStaffChannelId || config.logsChannelId || config.bankAlertsChannelId;

  const threshold =
    params.thresholdOverride && params.thresholdOverride > 0
      ? Math.floor(params.thresholdOverride)
      : config.bankDebtPingThreshold ?? 0;
  if (!threshold || threshold <= 0) return { ...empty, reason: "no_threshold" };

  const familyDbId = await resolveFamilyId(familySlug);
  const debtors = await getDebtRows({ familyId: familyDbId, threshold, limit: 500 });

  const cooldownMs = Math.max(1, config.bankDebtPingCooldownDays ?? 7) * DAY_MS;
  const escalateAfter = Math.max(1, config.bankDebtEscalateAfter ?? 3);
  const now = new Date();

  // États existants (par membre) pour cette famille.
  const states = await prisma.bankDebtReminderState.findMany({ where: { familyId: familyDbId } });
  const stateByMember = new Map(states.map((s) => [s.memberId, s]));

  // Éligibilité live des débiteurs (actif, dans le serveur, sans rôle exclu).
  const debtorMemberIds = debtors.map((d) => d.memberId).filter((v): v is string => Boolean(v));
  const eligMembers = debtorMemberIds.length
    ? await prisma.member.findMany({
        where: { id: { in: debtorMemberIds } },
        select: {
          id: true,
          isActive: true,
          discordInGuild: true,
          discordRoleIds: true,
          discordId: true,
          rpName: true,
        },
      })
    : [];
  const eligById = new Map(eligMembers.map((m) => [m.id, m]));

  // Membres couverts par une absence APPROUVÉE aujourd'hui.
  //
  // Ce contrôle n'existait pas : un membre en absence validée continuait de
  // recevoir des rappels, et chacun incrémentait son compteur vers l'escalade
  // État-Major. Constaté sur David Laps — rappel envoyé le 09/08 alors qu'il
  // était en absence du 05/08 au 12/08, compteur monté à 3, escalade déclenchée
  // le 14/08.
  //
  // Requête unique groupée, comme pour l'éligibilité : une par membre coûterait
  // un aller-retour par débiteur à chaque cycle.
  const absentMemberIds = new Set(
    debtorMemberIds.length
      ? (
          await prisma.absence.findMany({
            where: {
              memberId: { in: debtorMemberIds },
              status: "APPROVED",
              startAt: { lte: now },
              endAt: { gte: now },
            },
            select: { memberId: true },
          })
        ).map((a) => a.memberId)
      : []
  );

  const isEligible = (memberId: string | null) => {
    if (!memberId) return false;
    const m = eligById.get(memberId);
    if (!m || !m.isActive || m.discordInGuild === false) return false;
    // Placé AVANT le calcul du compteur : `isEligible` est évalué en amont du
    // `count = reminderCount + 1`, donc exclure ici suspend à la fois l'envoi
    // ET l'incrément. La dette reste due, seul le décompte vers l'escalade
    // s'arrête — un membre revenant d'un mois d'absence ne se retrouve pas
    // d'emblée au 3e rappel.
    if (absentMemberIds.has(memberId)) return false;
    const roles = Array.isArray(m.discordRoleIds) ? m.discordRoleIds : [];
    return !roles.some((r) => EXCLUDED_ROLE_IDS.includes(r));
  };

  const result: DebtReminderCycleResult = { ...empty, ok: true, debtorCount: debtors.length };
  const currentDebtorMemberIds = new Set<string>();

  for (const d of debtors) {
    if (!d.memberId || !d.discordId) {
      result.skippedIneligible += 1;
      continue;
    }
    currentDebtorMemberIds.add(d.memberId);
    if (!isEligible(d.memberId)) {
      result.skippedIneligible += 1;
      continue;
    }

    const state = stateByMember.get(d.memberId);
    // Cooldown par membre.
    if (state?.lastRemindedAt && now.getTime() - state.lastRemindedAt.getTime() < cooldownMs) {
      result.skippedCooldown += 1;
      continue;
    }

    const amount = Math.abs(Math.round(d.deficitAmount));
    const prevAmount = state?.lastDebtAmount ?? 0;
    const count = (state?.reminderCount ?? 0) + 1;
    const trend: Trend = !state || !state.reminderCount
      ? "new"
      : amount < prevAmount
        ? "reduced"
        : amount > prevAmount
          ? "increased"
          : "static";
    const firstRemindedAt = state?.firstRemindedAt ?? now;
    const daysSinceFirst = Math.floor((now.getTime() - firstRemindedAt.getTime()) / DAY_MS);
    const mention = `<@${d.discordId}>`;
      // Ce qui s'est reellement passe depuis le dernier rappel.
      const moves = await movementsSince(d.steamId ?? null, state?.lastRemindedAt ?? null);

    const reminder = memberMessage({ mention, amount, prevAmount, moves, count, trend, daysSinceFirst, escalateAfter });
    await enqueueMessage({
      familyId: familySlug,
      channelId,
      content: reminder.content,
      meta: { embeds: [reminder.embed] },
      entity: "BankDebtReminder",
      entityId: d.memberId,
    });
    result.sent += 1;

    // Escalade État-Major : 3e+ rappel SANS réduction, et pas déjà alerté récemment.
    const noReduction = trend !== "reduced";
    const alreadyAlertedRecently =
      state?.staffAlertedAt && now.getTime() - state.staffAlertedAt.getTime() < cooldownMs;
    let staffAlertedAt = state?.staffAlertedAt ?? null;
    if (count >= escalateAfter && noReduction && !alreadyAlertedRecently && staffChannelId) {
      // ORDRE IMPORTANT : la sanction AVANT l'alerte.
      //
      // L'alerte partait en premier et ne pouvait donc pas savoir ce que le bot
      // allait faire : elle reclamait « a traiter (sanction…) » alors qu'un
      // averto venait d'etre applique juste apres. Le staff etait invite a
      // sanctionner quelqu'un qui l'etait deja.
      let autoSanctionLabel: string | null = null;
      let cappedHighest: string | null = null;

      const member = eligById.get(d.memberId);
      if (member) {
        try {
          const outcome = await applyDebtSanction({
            familySlug,
            familyId: familyDbId,
            member,
            amount,
            count,
          });

          if (outcome.kind === "applied") {
            autoSanctionLabel = getSanctionLabel(outcome.type);
            result.autoSanctioned += 1;
          } else if (outcome.kind === "capped") {
            cappedHighest = outcome.highest;
          }
        } catch (err) {
          // Une sanction qui echoue ne doit pas interrompre les rappels des
          // autres debiteurs — ni empecher l'alerte de partir.
          console.error("[bank-debts] escalade sanction échouée", d.memberId, err);
        }
      }

      const staffAlert = staffAlertMessage({
        rpName: d.rpName,
        discordId: d.discordId,
        amount,
        firstAmount: prevAmount || amount,
        count,
        trend,
        daysSinceFirst,
        staffRoleId: config.staffRoleId ?? null,
        autoSanctionLabel,
      });
      await enqueueMessage({
        familyId: familySlug,
        channelId: staffChannelId,
        content: staffAlert.content,
        meta: { embeds: [staffAlert.embed] },
        entity: "BankDebtReminderStaff",
        entityId: d.memberId,
      });
      staffAlertedAt = now;
      result.escalatedToStaff += 1;

      // Plus rien a appliquer automatiquement : seul l'Etat-Major peut decider
      // d'un demote, on le lui demande explicitement.
      if (cappedHighest) {
        const demoteDecision = demoteDecisionMessage({
          rpName: d.rpName,
          discordId: d.discordId,
          amount,
          count,
          highest: cappedHighest,
          daysSinceFirst,
        });
        await enqueueMessage({
          familyId: familySlug,
          channelId: staffChannelId,
          content: demoteDecision.content,
          meta: { embeds: [demoteDecision.embed] },
          entity: "BankDebtDemoteDecision",
          entityId: d.memberId,
        });
        result.demoteDecisionRequested += 1;
      }
    }

    await prisma.bankDebtReminderState.upsert({
      where: { memberId: d.memberId },
      create: {
        familyId: familyDbId,
        memberId: d.memberId,
        discordId: d.discordId,
        reminderCount: count,
        firstRemindedAt: now,
        lastRemindedAt: now,
        lastDebtAmount: amount,
        peakDebtAmount: amount,
        staffAlertedAt,
      },
      update: {
        discordId: d.discordId,
        reminderCount: count,
        firstRemindedAt: state?.firstRemindedAt ?? now,
        lastRemindedAt: now,
        lastDebtAmount: amount,
        peakDebtAmount: Math.max(state?.peakDebtAmount ?? 0, amount),
        staffAlertedAt,
      },
    });
  }

  // Payeurs : membres avec un streak actif mais PLUS dans la liste des débiteurs
  // (dette repassée sous le seuil) → on remet le compteur à zéro.
  const paidStates = states.filter((s) => s.reminderCount > 0 && !currentDebtorMemberIds.has(s.memberId));
  if (paidStates.length) {
    await prisma.bankDebtReminderState.updateMany({
      where: { id: { in: paidStates.map((s) => s.id) } },
      data: { reminderCount: 0, lastDebtAmount: 0, staffAlertedAt: null },
    });
    result.paidReset = paidStates.length;
  }

  return result;
}
