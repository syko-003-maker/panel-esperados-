/**
 * `/purge-old` — suppression des messages d'un salon antérieurs à un seuil.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE QUE CETTE COMMANDE NE FAIT PAS
 * ────────────────────────────────────────────────────────────────────────────
 * Elle n'utilise PAS `bulkDelete`. Vérifié dans la bibliothèque installée :
 * `MaxBulkDeletableMessageAge` vaut exactement 14 jours, et au-delà les
 * messages sont soit filtrés du lot, soit rejetés en bloc par l'API. Une purge
 * à 6 mois ne peut donc rien supprimer en masse. Chaque message part
 * individuellement, ce qui est lent — de l'ordre d'une suppression par seconde
 * sur le bucket « vieux messages » — et c'est assumé.
 *
 * Conséquence : une purge de plusieurs milliers de messages survit largement au
 * jeton d'interaction (15 min). Le suivi part donc dans #logs, pas dans la
 * réponse éphémère.
 */

import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type TextChannel,
  type Guild,
  type GuildMember,
} from "discord.js";

import { IDS } from "../../ids.js";
import { sendLog } from "../logs/serverLogs.js";
import {
  PurgeRegistry,
  PurgeLock,
  computeThreshold,
  isEligible,
  emptyTally,
  accumulate,
  emptyPurgeTally,
  recordOutcome,
  classifyDeleteError,
  finalStatus,
  newPurgeId,
  buildCustomId,
  parseCustomId,
  MIN_AGE_MONTHS,
  MAX_AGE_MONTHS,
  MAX_SCAN_MESSAGES,
  CONFIRM_TTL_MS,
  PROGRESS_INTERVAL_MS,
  type PurgeTally,
  type ScanTally,
  type PurgeStatus,
} from "./purge-plan.js";
import {
  buildDryRunEmbed,
  buildConfirmEmbed,
  buildNothingToDoEmbed,
  buildStartEmbed,
  buildProgressEmbed,
  buildReportEmbed,
  buildRefusalEmbed,
  buildCanceledEmbed,
  buildBusyEmbed,
  buildLaunchedEmbed,
} from "./purge-embeds.js";

const registry = new PurgeRegistry();

/** Un seul nettoyage à la fois sur toute l'instance. */
const purgeLock = new PurgeLock();

/** Cadence entre deux suppressions. La file de @discordjs/rest fait le reste. */
const DELETE_SPACING_MS = 350;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── Autorisation ────────────────────────────────────────────────────────────

/**
 * Chef, Sous-Chef et État-Major uniquement. Le staff général est exclu :
 * `isChefOrStaff` est trop large pour une suppression irréversible.
 *
 * `setDefaultMemberPermissions` ne suffit pas — c'est une valeur par défaut que
 * tout administrateur du serveur peut réattribuer. Le contrôle réel est ici, et
 * il est rejoué au clic de confirmation.
 */
async function isPurgeAuthorized(guild: Guild, userId: string): Promise<boolean> {
  const allowed = [
    IDS.CHEF_FAMILLE_ROLE_ID,
    IDS.SOUS_CHEF_FAMILLE_ROLE_ID,
    IDS.ETAT_MAJOR_ROLE_ID,
  ].filter(Boolean) as string[];
  if (allowed.length === 0) return false;
  try {
    const member: GuildMember = await guild.members.fetch(userId);
    return allowed.some((roleId) => member.roles.cache.has(roleId));
  } catch {
    return false;
  }
}

// ── Définition de la commande ───────────────────────────────────────────────

export function buildPurgeCommands() {
  return [
    new SlashCommandBuilder()
      .setName("purge-old")
      .setDescription("Supprime les anciens messages d'un salon (Chef / Sous-Chef / État-Major)")
      .addChannelOption((o) =>
        o
          .setName("salon")
          .setDescription("Salon à nettoyer")
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(true)
      )
      .addIntegerOption((o) =>
        o
          .setName("anciennete")
          .setDescription("Supprimer les messages de plus de N mois")
          .setRequired(true)
          .setMinValue(MIN_AGE_MONTHS)
          .setMaxValue(MAX_AGE_MONTHS)
          .addChoices(
            { name: "3 mois", value: 3 },
            { name: "6 mois", value: 6 },
            { name: "12 mois", value: 12 },
            { name: "24 mois", value: 24 }
          )
      )
      // Pas d'option « simulation » exposée : un sélecteur booléen Discord
      // affiche « True / False » à l'utilisateur, et l'aperçu obligatoire rend
      // l'option superflue — la commande ne supprime jamais sans confirmation.
      // Le mode aperçu-seul reste atteignable en interne via `runPurgePreview`.
      //
      // `ManageMessages`, et non `Administrator` : Discord applique cette valeur
      // AVANT d'émettre l'interaction. Avec `Administrator`, aucun des trois
      // rôles autorisés ne l'avait, la commande n'apparaissait pour personne et
      // `isPurgeAuthorized` n'était jamais atteint. Même valeur que /clear et
      // /purge-user, cohérente avec le domaine de la commande.
      //
      // Ce réglage n'est PAS le contrôle d'accès : il rend la commande visible.
      // Le filtre réel reste `isPurgeAuthorized`, rejoué au clic de confirmation.
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .setDMPermission(false),
  ];
}

// ── Balayage ────────────────────────────────────────────────────────────────

/**
 * Parcourt le salon page par page et compte RÉELLEMENT. Pas d'estimation :
 * l'aperçu doit annoncer un chiffre exact, sinon la confirmation ne vaut rien.
 */
async function scanChannel(channel: TextChannel, thresholdMs: number): Promise<ScanTally> {
  let tally = emptyTally();
  let before: string | undefined;

  for (;;) {
    const page = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
    if (page.size === 0) break;

    tally = accumulate(tally, [...page.values()].map((m) => m.createdTimestamp), thresholdMs);
    before = page.last()?.id;

    if (tally.capReached || !before) break;
    if (page.size < 100) break;
  }

  return tally;
}

// ── Aperçu ──────────────────────────────────────────────────────────────────

/**
 * Point d'entrée de la commande. L'aperçu est TOUJOURS affiché : c'est lui, et
 * la confirmation qui le suit, qui garantissent qu'aucun message ne part sans
 * un acte volontaire.
 */
export async function handlePurgeOld(interaction: ChatInputCommandInteraction): Promise<void> {
  return runPurgePreview(interaction, false);
}

/**
 * Aperçu du nettoyage.
 *
 * `previewOnly = true` compte et s'arrête là, sans proposer de confirmation.
 * Ce mode n'est plus exposé comme option Discord — un sélecteur booléen y
 * affichait « True / False » — mais reste atteignable depuis le code pour un
 * diagnostic ou un test manuel.
 */
export async function runPurgePreview(
  interaction: ChatInputCommandInteraction,
  previewOnly: boolean
): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (!interaction.guild) {
    await interaction.editReply({ embeds: [buildRefusalEmbed("Commande utilisable uniquement dans un serveur.")] });
    return;
  }
  if (!(await isPurgeAuthorized(interaction.guild, interaction.user.id))) {
    await interaction.editReply({
      embeds: [buildRefusalEmbed("Réservé au Chef de famille, au Sous-Chef et à l'État-Major.")],
    });
    return;
  }

  const channelOpt = interaction.options.getChannel("salon", true);
  const months = interaction.options.getInteger("anciennete", true);

  // Verrou AVANT tout accès au salon : un refus ne doit déclencher aucun
  // balayage, aucune écriture d'audit, aucun bouton.
  const purgeId = newPurgeId();
  const acquired = purgeLock.tryAcquire({
    purgeId,
    channelId: channelOpt.id,
    userId: interaction.user.id,
    startedAtMs: Date.now(),
    phase: "SCAN",
  });
  if (!acquired.ok) {
    await interaction.editReply({
      embeds: [buildBusyEmbed({
        channelId: acquired.holder.channelId,
        userId: acquired.holder.userId,
        startedAtMs: acquired.holder.startedAtMs,
      })],
    });
    return;
  }

  try {

  const channel = await interaction.guild.channels.fetch(channelOpt.id).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    await interaction.editReply({ embeds: [buildRefusalEmbed("Salon introuvable ou non textuel.")] });
    return;
  }

  const me = interaction.guild.members.me;
  const perms = me ? channel.permissionsFor(me) : null;
  if (!perms?.has(PermissionFlagsBits.ViewChannel) || !perms.has(PermissionFlagsBits.ReadMessageHistory)) {
    await interaction.editReply({
      embeds: [buildRefusalEmbed("Le bot ne peut pas lire l'historique de ce salon.")],
    });
    return;
  }
  if (!previewOnly && !perms.has(PermissionFlagsBits.ManageMessages)) {
    await interaction.editReply({
      embeds: [buildRefusalEmbed("Le bot n'a pas la permission **Gérer les messages** dans ce salon.")],
    });
    return;
  }

  const threshold = computeThreshold(new Date(), months);
  let tally: ScanTally;
  try {
    tally = await scanChannel(channel as TextChannel, threshold.getTime());
  } catch (err) {
    await interaction.editReply({
      embeds: [buildRefusalEmbed("Impossible de lire l'historique de ce salon.")],
    });
    return;
  }

  await auditPurge({
    guild: interaction.guild,
    purgeId,
    userId: interaction.user.id,
    userTag: interaction.user.tag,
    channelId: channel.id,
    thresholdMs: threshold.getTime(),
    matchedCount: tally.matched,
    deletedCount: 0,
    startedAtMs: Date.now(),
    finishedAtMs: Date.now(),
    status: "PREVIEW",
    extra: { previewOnly, months, scanned: tally.scanned, capReached: tally.capReached },
  });

  // Simulation, ou rien à faire : pas de boutons, donc rien à confirmer.
  if (previewOnly) {
    await interaction.editReply({ embeds: [buildDryRunEmbed({ channelId: channel.id, months, tally })] });
    return;
  }
  if (tally.matched === 0) {
    await interaction.editReply({ embeds: [buildNothingToDoEmbed({ channelId: channel.id, months })] });
    return;
  }

  const now = Date.now();
  registry.sweep(now);
  registry.put({
    purgeId,
    userId: interaction.user.id,
    guildId: interaction.guild.id,
    channelId: channel.id,
    months,
    thresholdMs: threshold.getTime(),
    matchedCount: tally.matched,
    keptCount: tally.kept,
    newestMatchedAt: tally.newestMatchedAt,
    oldestFoundAt: tally.oldestFoundAt,
    capReached: tally.capReached,
    createdAtMs: now,
    expiresAtMs: now + CONFIRM_TTL_MS,
    consumed: false,
  });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(buildCustomId("confirm", purgeId))
      .setLabel("✅ Confirmer")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(buildCustomId("cancel", purgeId))
      .setLabel("✖️ Annuler")
      .setStyle(ButtonStyle.Secondary)
  );

  await interaction.editReply({
    embeds: [buildConfirmEmbed({ channelId: channel.id, months, tally })],
    components: [row],
  });
  } finally {
    // Libéré quoi qu'il arrive : succès, refus de permission, salon
    // inaccessible, exception. Sans ce `finally`, un seul échec bloquerait la
    // commande pour tout le monde jusqu'au prochain redémarrage.
    //
    // Le verrou n'est PAS conservé jusqu'à la confirmation : un aperçu
    // abandonné gèlerait la commande pendant les 5 minutes du TTL. La
    // confirmation le reprend pour son propre compte.
    purgeLock.release(purgeId);
  }
}

// ── Boutons ─────────────────────────────────────────────────────────────────

export function isPurgeButton(customId: string): boolean {
  return parseCustomId(customId) !== null;
}

export async function handlePurgeButton(interaction: ButtonInteraction): Promise<void> {
  const parsed = parseCustomId(interaction.customId);
  if (!parsed) return;

  if (parsed.action === "cancel") {
    const res = registry.cancel(parsed.purgeId, interaction.user.id);
    if (!res.ok && res.reason === "WRONG_USER") {
      await interaction.reply({
        embeds: [buildRefusalEmbed("Ce bouton appartient à une autre personne.")],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    if (res.ok && interaction.guild) {
      await auditPurge({
        guild: interaction.guild,
        purgeId: parsed.purgeId,
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        channelId: res.pending.channelId,
        thresholdMs: res.pending.thresholdMs,
        matchedCount: res.pending.matchedCount,
        deletedCount: 0,
        startedAtMs: res.pending.createdAtMs,
        finishedAtMs: Date.now(),
        status: "CANCELED",
        extra: {},
      });
    }
    await interaction.update({ embeds: [buildCanceledEmbed()], components: [] });
    return;
  }

  // ── Confirmation ──────────────────────────────────────────────────────────
  const claim = registry.claim(parsed.purgeId, interaction.user.id, Date.now());
  if (!claim.ok) {
    const message =
      claim.reason === "WRONG_USER" ? "Ce bouton appartient à une autre personne."
      : claim.reason === "EXPIRED" ? "Cette confirmation a expiré. Relancez la commande."
      : claim.reason === "ALREADY_USED" ? "Ce nettoyage a déjà été lancé."
      : "Cette confirmation n'est plus valide. Relancez la commande.";
    await interaction.reply({ embeds: [buildRefusalEmbed(message)], flags: MessageFlags.Ephemeral });
    return;
  }

  const pending = claim.pending;

  // Verrou repris pour toute la durée de la suppression. `tryAcquire` ne
  // contient aucun `await` : deux confirmations simultanées ne peuvent pas
  // passer toutes les deux, même arrivées dans la même milliseconde.
  const held = purgeLock.tryAcquire({
    purgeId: pending.purgeId,
    channelId: pending.channelId,
    userId: interaction.user.id,
    startedAtMs: Date.now(),
    phase: "DELETE",
  });
  if (!held.ok) {
    await interaction.reply({
      embeds: [buildBusyEmbed({
        channelId: held.holder.channelId,
        userId: held.holder.userId,
        startedAtMs: held.holder.startedAtMs,
      })],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!interaction.guild || interaction.guild.id !== pending.guildId) {
    purgeLock.release(pending.purgeId);
    await interaction.reply({ embeds: [buildRefusalEmbed("Serveur invalide.")], flags: MessageFlags.Ephemeral });
    return;
  }
  // Deuxième contrôle de permission : le rôle a pu être retiré depuis l'aperçu.
  if (!(await isPurgeAuthorized(interaction.guild, interaction.user.id))) {
    purgeLock.release(pending.purgeId);
    await interaction.reply({
      embeds: [buildRefusalEmbed("Vous n'avez plus les droits requis.")],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const channel = await interaction.guild.channels.fetch(pending.channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    purgeLock.release(pending.purgeId);
    await interaction.update({
      embeds: [buildRefusalEmbed("Le salon n'existe plus. Nettoyage abandonné.")],
      components: [],
    });
    return;
  }

  await interaction.update({ embeds: [buildLaunchedEmbed(channel.id)], components: [] });

  void runPurge(interaction.guild, channel as TextChannel, pending, interaction.user.id, interaction.user.tag);
}

// ── Exécution ───────────────────────────────────────────────────────────────

async function runPurge(
  guild: Guild,
  channel: TextChannel,
  pending: { purgeId: string; channelId: string; months: number; matchedCount: number; capReached: boolean },
  userId: string,
  userTag: string
): Promise<void> {
  const startedAtMs = Date.now();

  try {
  // Le seuil est RECALCULÉ ici : entre l'aperçu et le clic, le temps a passé.
  // On repart de la durée choisie, jamais de la valeur figée à l'aperçu.
  const threshold = computeThreshold(new Date(), pending.months).getTime();

  let tally: PurgeTally = emptyPurgeTally(pending.matchedCount, pending.capReached);
  let lastProgressAt = Date.now();

  await sendLog(
    guild,
    buildStartEmbed({
      channelId: channel.id,
      userId,
      months: pending.months,
      targeted: pending.matchedCount,
    })
  ).catch(() => {});

  let status: PurgeStatus = "RUNNING";
  try {
    let before: string | undefined;
    let scanned = 0;

    outer: for (;;) {
      const page = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
      if (page.size === 0) break;
      before = page.last()?.id;

      for (const msg of page.values()) {
        if (scanned >= MAX_SCAN_MESSAGES) {
          tally = { ...tally, capReached: true };
          break outer;
        }
        scanned += 1;

        // Le garde-fou décisif : jamais un message plus récent que le seuil.
        if (!isEligible(msg.createdTimestamp, threshold)) continue;

        try {
          await msg.delete();
          tally = recordOutcome(tally, "deleted");
        } catch (err) {
          tally = recordOutcome(tally, classifyDeleteError(err));
        }

        await sleep(DELETE_SPACING_MS);

        if (Date.now() - lastProgressAt >= PROGRESS_INTERVAL_MS) {
          lastProgressAt = Date.now();
          await sendLog(guild, buildProgressEmbed({ channelId: channel.id, tally })).catch(() => {});
        }
      }

      if (!before || page.size < 100) break;
    }

    status = finalStatus(tally);
  } catch (err) {
    status = "FAILED";
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      event: "purge_failed",
      purgeId: pending.purgeId,
      error: err instanceof Error ? err.message : String(err),
    }));
  }

  const finishedAtMs = Date.now();

  await sendLog(
    guild,
    buildReportEmbed({
      channelId: channel.id,
      userId,
      months: pending.months,
      tally,
      status,
      durationSeconds: (finishedAtMs - startedAtMs) / 1000,
    })
  ).catch(() => {});

  await auditPurge({
    guild,
    purgeId: pending.purgeId,
    userId,
    userTag,
    channelId: channel.id,
    thresholdMs: threshold,
    matchedCount: tally.targeted,
    deletedCount: tally.deleted,
    startedAtMs,
    finishedAtMs,
    status,
    extra: {
      alreadyGone: tally.alreadyGone,
      forbidden: tally.forbidden,
      failed: tally.failed,
      capReached: tally.capReached,
      months: pending.months,
    },
  });
  } finally {
    // Libéré quoi qu'il arrive. Une exception synchrone — construction d'embed,
    // sérialisation — contournerait une libération placée en fin de corps et
    // gèlerait `/purge-old` pour tout le monde jusqu'au prochain redémarrage.
    purgeLock.release(pending.purgeId);
  }
}

// ── Audit ───────────────────────────────────────────────────────────────────

/**
 * Trace structurée. On réutilise `AuditLog` et son champ `meta` : aucun modèle
 * Prisma ni migration ne sont nécessaires.
 *
 * Le CONTENU des messages supprimés n'est jamais journalisé — seulement des
 * compteurs et des identifiants.
 */
async function auditPurge(params: {
  guild: Guild;
  purgeId: string;
  userId: string;
  userTag: string;
  channelId: string;
  thresholdMs: number;
  matchedCount: number;
  deletedCount: number;
  startedAtMs: number;
  finishedAtMs: number;
  status: PurgeStatus;
  extra: Record<string, unknown>;
}): Promise<void> {
  const record = {
    purgeId: params.purgeId,
    initiatedBy: params.userId,
    guildId: params.guild.id,
    channelId: params.channelId,
    threshold: new Date(params.thresholdMs).toISOString(),
    matchedCount: params.matchedCount,
    deletedCount: params.deletedCount,
    startedAt: new Date(params.startedAtMs).toISOString(),
    finishedAt: new Date(params.finishedAtMs).toISOString(),
    status: params.status,
    ...params.extra,
  };

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "info",
    event: "purge_audit",
    ...record,
  }));

  try {
    const { PrismaClient } = await import("@prisma/client");
    const { toFamilyCuid } = await import("../../lib/family-id.js");
    const prisma = new PrismaClient();
    try {
      await prisma.auditLog.create({
        data: {
          familyId: await toFamilyCuid(prisma, process.env.FAMILY_ID ?? "esperados"),
          actorType: "staff",
          actorId: params.userId,
          actorName: params.userTag,
          action: `DISCORD_PURGE_${params.status}`,
          entity: "MessagePurge",
          entityId: params.purgeId,
          entityName: `Nettoyage du salon ${params.channelId}`,
          meta: record as any,
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  } catch (e) {
    console.error("[purge] audit DB failed:", e);
  }
}
