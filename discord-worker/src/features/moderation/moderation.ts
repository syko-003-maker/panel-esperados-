/**
 * Commandes de modération Discord
 * /ban /kick /mute /warn /warns /clear
 */

import {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type Client,
} from "discord.js";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ─── Définitions des commandes ────────────────────────────────────────────────

export function buildModerationCommands() {
  return [
    new SlashCommandBuilder()
      .setName("ban")
      .setDescription("Bannir un membre du serveur")
      .addUserOption((o) => o.setName("membre").setDescription("Membre à bannir").setRequired(true))
      .addStringOption((o) => o.setName("raison").setDescription("Raison du ban").setRequired(true))
      .addIntegerOption((o) => o.setName("jours").setDescription("Supprimer les messages des X derniers jours (0-7)").setMinValue(0).setMaxValue(7))
      .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
      .setDMPermission(false),

    new SlashCommandBuilder()
      .setName("kick")
      .setDescription("Expulser un membre du serveur")
      .addUserOption((o) => o.setName("membre").setDescription("Membre à expulser").setRequired(true))
      .addStringOption((o) => o.setName("raison").setDescription("Raison du kick").setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
      .setDMPermission(false),

    new SlashCommandBuilder()
      .setName("mute")
      .setDescription("Rendre muet un membre (timeout Discord)")
      .addUserOption((o) => o.setName("membre").setDescription("Membre à mute").setRequired(true))
      .addIntegerOption((o) => o.setName("duree").setDescription("Durée en minutes").setRequired(true).setMinValue(1).setMaxValue(40320))
      .addStringOption((o) => o.setName("raison").setDescription("Raison du mute").setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .setDMPermission(false),

    new SlashCommandBuilder()
      .setName("warn")
      .setDescription("Avertir un membre")
      .addUserOption((o) => o.setName("membre").setDescription("Membre à avertir").setRequired(true))
      .addStringOption((o) => o.setName("raison").setDescription("Raison de l'avertissement").setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .setDMPermission(false),

    new SlashCommandBuilder()
      .setName("warns")
      .setDescription("Voir les avertissements d'un membre")
      .addUserOption((o) => o.setName("membre").setDescription("Membre à consulter").setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .setDMPermission(false),

    new SlashCommandBuilder()
      .setName("unwarn")
      .setDescription("Supprimer un avertissement")
      .addStringOption((o) => o.setName("id").setDescription("ID de l'avertissement (visible dans /warns)").setRequired(true))
      .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
      .setDMPermission(false),

    new SlashCommandBuilder()
      .setName("clear")
      .setDescription("Supprimer des messages en masse")
      .addIntegerOption((o) => o.setName("nombre").setDescription("Nombre de messages à supprimer (1-100)").setRequired(true).setMinValue(1).setMaxValue(100))
      .addUserOption((o) => o.setName("membre").setDescription("Filtrer par membre (optionnel)").setRequired(false))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .setDMPermission(false),
  ];
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function handleBan(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const target = interaction.options.getUser("membre", true);
  const reason = interaction.options.getString("raison", true);
  const days   = interaction.options.getInteger("jours") ?? 0;

  if (!interaction.guild) { await interaction.editReply("❌ Commande utilisable uniquement dans un serveur."); return; }
  if (target.id === interaction.user.id) { await interaction.editReply("❌ Tu ne peux pas te bannir toi-même."); return; }

  try {
    await interaction.guild.members.ban(target.id, { reason: `${interaction.user.tag} : ${reason}`, deleteMessageDays: days as 0|1|2|3|4|5|6|7 });

    // DM avant ban
    try {
      await target.send({ embeds: [
        new EmbedBuilder()
          .setTitle("🔨 Tu as été banni")
          .setColor(0xdc2626)
          .addFields(
            { name: "Serveur", value: interaction.guild.name, inline: true },
            { name: "Raison",  value: reason,                 inline: false },
          )
          .setTimestamp(),
      ]});
    } catch { /* DM fermés */ }

    await interaction.editReply({ embeds: [
      new EmbedBuilder()
        .setTitle("✅ Membre banni")
        .setColor(0xdc2626)
        .addFields(
          { name: "Membre",  value: `${target.tag} \`${target.id}\``, inline: true },
          { name: "Par",     value: `<@${interaction.user.id}>`,       inline: true },
          { name: "Raison",  value: reason,                            inline: false },
        )
        .setTimestamp(),
    ]});
  } catch (err: any) {
    await interaction.editReply(`❌ Impossible de bannir : ${err.message}`);
  }
}

export async function handleKick(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const target = interaction.options.getUser("membre", true);
  const reason = interaction.options.getString("raison", true);

  if (!interaction.guild) { await interaction.editReply("❌ Commande utilisable uniquement dans un serveur."); return; }
  if (target.id === interaction.user.id) { await interaction.editReply("❌ Tu ne peux pas te kick toi-même."); return; }

  try {
    const member = await interaction.guild.members.fetch(target.id);
    await member.kick(`${interaction.user.tag} : ${reason}`);

    try {
      await target.send({ embeds: [
        new EmbedBuilder()
          .setTitle("👢 Tu as été expulsé")
          .setColor(0xf97316)
          .addFields(
            { name: "Serveur", value: interaction.guild.name, inline: true },
            { name: "Raison",  value: reason,                 inline: false },
          )
          .setTimestamp(),
      ]});
    } catch { /* DM fermés */ }

    await interaction.editReply({ embeds: [
      new EmbedBuilder()
        .setTitle("✅ Membre expulsé")
        .setColor(0xf97316)
        .addFields(
          { name: "Membre", value: `${target.tag} \`${target.id}\``, inline: true },
          { name: "Par",    value: `<@${interaction.user.id}>`,       inline: true },
          { name: "Raison", value: reason,                            inline: false },
        )
        .setTimestamp(),
    ]});
  } catch (err: any) {
    await interaction.editReply(`❌ Impossible d'expulser : ${err.message}`);
  }
}

export async function handleMute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const target  = interaction.options.getUser("membre", true);
  const minutes = interaction.options.getInteger("duree", true);
  const reason  = interaction.options.getString("raison", true);

  if (!interaction.guild) { await interaction.editReply("❌ Commande utilisable uniquement dans un serveur."); return; }
  if (target.id === interaction.user.id) { await interaction.editReply("❌ Tu ne peux pas te mute toi-même."); return; }

  try {
    const member   = await interaction.guild.members.fetch(target.id);
    const until    = new Date(Date.now() + minutes * 60 * 1000);
    await member.timeout(minutes * 60 * 1000, `${interaction.user.tag} : ${reason}`);

    const durLabel = minutes < 60
      ? `${minutes} minute(s)`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}h${minutes % 60 > 0 ? ` ${minutes % 60}min` : ""}`
        : `${Math.floor(minutes / 1440)} jour(s)`;

    try {
      await target.send({ embeds: [
        new EmbedBuilder()
          .setTitle("🔇 Tu as été mis en sourdine")
          .setColor(0xf59e0b)
          .addFields(
            { name: "Serveur",  value: interaction.guild.name,                             inline: true },
            { name: "Durée",    value: durLabel,                                           inline: true },
            { name: "Expire",   value: `<t:${Math.floor(until.getTime() / 1000)}:R>`,     inline: true },
            { name: "Raison",   value: reason,                                             inline: false },
          )
          .setTimestamp(),
      ]});
    } catch { /* DM fermés */ }

    await interaction.editReply({ embeds: [
      new EmbedBuilder()
        .setTitle("✅ Membre mute")
        .setColor(0xf59e0b)
        .addFields(
          { name: "Membre",  value: `${target.tag} \`${target.id}\``,                  inline: true },
          { name: "Par",     value: `<@${interaction.user.id}>`,                         inline: true },
          { name: "Durée",   value: durLabel,                                            inline: true },
          { name: "Expire",  value: `<t:${Math.floor(until.getTime() / 1000)}:R>`,      inline: true },
          { name: "Raison",  value: reason,                                              inline: false },
        )
        .setTimestamp(),
    ]});
  } catch (err: any) {
    await interaction.editReply(`❌ Impossible de mute : ${err.message}`);
  }
}

export async function handleWarn(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const target = interaction.options.getUser("membre", true);
  const reason = interaction.options.getString("raison", true);

  if (!interaction.guild) { await interaction.editReply("❌ Commande utilisable uniquement dans un serveur."); return; }

  const warn = await prisma.discordWarn.create({
    data: {
      guildId:     interaction.guild.id,
      targetId:    target.id,
      moderatorId: interaction.user.id,
      reason,
    },
  });

  const total = await prisma.discordWarn.count({ where: { guildId: interaction.guild.id, targetId: target.id } });

  try {
    await target.send({ embeds: [
      new EmbedBuilder()
        .setTitle("⚠️ Tu as reçu un avertissement")
        .setColor(0xf59e0b)
        .addFields(
          { name: "Serveur",  value: interaction.guild.name, inline: true },
          { name: "Raison",   value: reason,                 inline: false },
          { name: "Total",    value: `${total} avertissement(s)`, inline: true },
        )
        .setTimestamp(),
    ]});
  } catch { /* DM fermés */ }

  await interaction.editReply({ embeds: [
    new EmbedBuilder()
      .setTitle("✅ Avertissement enregistré")
      .setColor(0xf59e0b)
      .addFields(
        { name: "Membre",  value: `${target.tag} \`${target.id}\``, inline: true },
        { name: "Par",     value: `<@${interaction.user.id}>`,       inline: true },
        { name: "Raison",  value: reason,                            inline: false },
        { name: "Total",   value: `${total} avertissement(s)`,       inline: true },
        { name: "ID warn", value: `\`${warn.id}\``,                  inline: true },
      )
      .setTimestamp(),
  ]});
}

export async function handleWarns(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const target = interaction.options.getUser("membre", true);
  if (!interaction.guild) { await interaction.editReply("❌ Commande utilisable uniquement dans un serveur."); return; }

  const warns = await prisma.discordWarn.findMany({
    where:   { guildId: interaction.guild.id, targetId: target.id },
    orderBy: { createdAt: "desc" },
    take:    10,
  });

  if (warns.length === 0) {
    await interaction.editReply({ embeds: [
      new EmbedBuilder()
        .setTitle(`📋 Avertissements — ${target.tag}`)
        .setColor(0x22c55e)
        .setDescription("✅ Aucun avertissement.")
        .setThumbnail(target.displayAvatarURL())
        .setTimestamp(),
    ]});
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`📋 Avertissements — ${target.tag}`)
    .setColor(0xf59e0b)
    .setThumbnail(target.displayAvatarURL())
    .setDescription(`**${warns.length}** avertissement(s) (10 derniers affichés)`)
    .setTimestamp();

  for (const w of warns) {
    embed.addFields({
      name:  `⚠️ ${w.createdAt.toLocaleDateString("fr-FR")} — par <@${w.moderatorId}>`,
      value: `${w.reason}\n\`ID: ${w.id}\``,
      inline: false,
    });
  }

  await interaction.editReply({ embeds: [embed] });
}

export async function handleUnwarn(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const warnId = interaction.options.getString("id", true).trim();

  try {
    const warn = await prisma.discordWarn.delete({ where: { id: warnId } });
    await interaction.editReply(`✅ Avertissement \`${warn.id}\` supprimé.`);
  } catch {
    await interaction.editReply("❌ Avertissement introuvable. Vérifie l'ID avec `/warns`.");
  }
}

export async function handleClear(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  const count  = interaction.options.getInteger("nombre", true);
  const filter = interaction.options.getUser("membre");

  if (!interaction.channel || !interaction.channel.isTextBased()) {
    await interaction.editReply("❌ Impossible dans ce salon.");
    return;
  }

  try {
    let messages = await interaction.channel.messages.fetch({ limit: 100 });

    if (filter) {
      messages = messages.filter((m) => m.author.id === filter.id);
    }

    const toDelete = messages.first(count);

    const deleted = await (interaction.channel as any).bulkDelete(toDelete, true);

    await interaction.editReply(`✅ **${deleted.size}** message(s) supprimé(s)${filter ? ` de ${filter.tag}` : ""}.`);
  } catch (err: any) {
    await interaction.editReply(`❌ Erreur : ${err.message}`);
  }
}
