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
import { getOrCreateDiscordConfig, enqueueMessage } from "@/lib/discord/discord";
import { getDebtRows } from "@/lib/bank-debts";

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

export type DebtReminderCycleResult = {
  ok: boolean;
  reason?: string;
  sent: number;
  escalatedToStaff: number;
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
        select: { id: true, isActive: true, discordInGuild: true, discordRoleIds: true },
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
