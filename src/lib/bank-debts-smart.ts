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
import { checkSanctionTargetEligibility, ETAT_MAJOR_ROLE_ID } from "@/lib/sanctions";
import { getSystemActorId, SYSTEM_ACTOR_NAME } from "@/lib/staff/system-actor";

// Démote / Blacklist / Réserviste → pas de rappel (comme le worker single-ping).
const EXCLUDED_ROLE_IDS = ["1340837563753304075", "1338901141873758288", "1312845999366209682"];

const DAY_MS = 24 * 60 * 60 * 1000;

function fmt(amount: number): string {
  return `${Math.abs(Math.round(amount)).toLocaleString("fr-FR")}$`;
}

type Trend = "new" | "reduced" | "static" | "increased";

function memberMessage(params: {
  mention: string;
  amount: number;
  count: number;
  trend: Trend;
  daysSinceFirst: number;
  escalateAfter: number;
}): string {
  const { mention, amount, count, trend, daysSinceFirst, escalateAfter } = params;
  const amt = fmt(amount);

  if (count <= 1) {
    return `${mention} 📌 **Rappel banque** — tu es en déficit de **${amt}** sur le compte de la famille. Merci de régulariser dès que possible.`;
  }

  if (count < escalateAfter) {
    if (trend === "reduced") {
      return `${mention} 📌 **${count}ᵉ rappel** — ta dette a baissé (**${amt}** restants) mais n'est pas soldée. Continue, merci de finir de régulariser.`;
    }
    const evol = trend === "increased" ? "n'a pas baissé, elle a même augmenté" : "n'a pas bougé";
    return `${mention} ⚠️ **${count}ᵉ rappel** — ta dette (**${amt}**) ${evol} depuis le dernier rappel. Merci de régulariser rapidement.`;
  }

  // count >= escalateAfter → dernier avertissement
  if (trend === "reduced") {
    return `${mention} ⚠️ **${count}ᵉ rappel** — ta dette baisse (**${amt}** restants) mais reste ouverte. Solde-la pour éviter une sanction.`;
  }
  const since = daysSinceFirst > 0 ? ` depuis ${daysSinceFirst} jour${daysSinceFirst > 1 ? "s" : ""}` : "";
  return (
    `${mention} 🚨 **${count}ᵉ rappel — dernier avertissement** — ta dette (**${amt}**) n'a été ` +
    `ni remboursée ni réduite${since}. L'État-Major est informé et pourra sanctionner.`
  );
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
}): string {
  const { rpName, discordId, amount, firstAmount, count, trend, daysSinceFirst, staffRoleId } = params;
  const who = rpName ? `**${rpName}**${discordId ? ` (<@${discordId}>)` : ""}` : discordId ? `<@${discordId}>` : "Membre inconnu";
  const evol =
    trend === "increased"
      ? `en hausse (+${fmt(Math.max(0, amount - firstAmount))} depuis le dernier rappel)`
      : "stagnante";
  const since = daysSinceFirst > 0 ? ` depuis ${daysSinceFirst} jour${daysSinceFirst > 1 ? "s" : ""}` : "";
  const rolePing = staffRoleId ? `<@&${staffRoleId}> ` : "";
  return (
    `${rolePing}🚨 **Débiteur récurrent** — ${who} signalé **${count} fois**, dette **${fmt(amount)}** ` +
    `(${evol})${since} sans remboursement. À traiter (sanction, arrangement…).`
  );
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
}): string {
  const who = params.rpName
    ? `**${params.rpName}**${params.discordId ? ` (<@${params.discordId}>)` : ""}`
    : params.discordId
      ? `<@${params.discordId}>`
      : "Membre inconnu";
  const current = params.highest
    ? SANCTION_LABELS[params.highest] ?? params.highest
    : "aucune sanction";
  const since =
    params.daysSinceFirst > 0
      ? ` depuis ${params.daysSinceFirst} jour${params.daysSinceFirst > 1 ? "s" : ""}`
      : "";

  return (
    `<@&${ETAT_MAJOR_ROLE_ID}> 🔴 **Décision requise — escalade épuisée**\n` +
    `${who} est déjà sous **${current}** et sa dette de **${fmt(params.amount)}** ` +
    `n'a toujours pas bougé après **${params.count} rappels**${since}.\n` +
    `Le système ne peut pas aller plus loin : le cran suivant serait un **démote**, ` +
    `qui relève de votre décision.`
  );
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
  const isEligible = (memberId: string | null) => {
    if (!memberId) return false;
    const m = eligById.get(memberId);
    if (!m || !m.isActive || m.discordInGuild === false) return false;
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

    await enqueueMessage({
      familyId: familySlug,
      channelId,
      content: memberMessage({ mention, amount, count, trend, daysSinceFirst, escalateAfter }),
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
      await enqueueMessage({
        familyId: familySlug,
        channelId: staffChannelId,
        content: staffAlertMessage({
          rpName: d.rpName,
          discordId: d.discordId,
          amount,
          firstAmount: prevAmount || amount,
          count,
          trend,
          daysSinceFirst,
          staffRoleId: config.staffRoleId ?? null,
        }),
        entity: "BankDebtReminderStaff",
        entityId: d.memberId,
      });
      staffAlertedAt = now;
      result.escalatedToStaff += 1;

      // Escalade disciplinaire : un cran au-dessus de ce que le membre a déjà,
      // et jamais au-delà de l'averto (le démote reste une décision humaine).
      // Même condition que l'alerte EM, donc soumis au même cooldown : pas de
      // sanction à chaque passage du cron.
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
            result.autoSanctioned += 1;
          } else if (outcome.kind === "capped") {
            // Plus rien à appliquer automatiquement : on alerte explicitement
            // l'État-Major, seul habilité à décider d'un démote.
            await enqueueMessage({
              familyId: familySlug,
              channelId: staffChannelId,
              content: demoteDecisionMessage({
                rpName: d.rpName,
                discordId: d.discordId,
                amount,
                count,
                highest: outcome.highest,
                daysSinceFirst,
              }),
              entity: "BankDebtDemoteDecision",
              entityId: d.memberId,
            });
            result.demoteDecisionRequested += 1;
          }
        } catch (err) {
          // Une sanction qui échoue ne doit pas interrompre les rappels des
          // autres débiteurs.
          console.error("[bank-debts] escalade sanction échouée", d.memberId, err);
        }
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
