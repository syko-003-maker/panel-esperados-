"use strict";

import "dotenv/config";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  Message,
  ModalBuilder,
  Partials,
  TextInputBuilder,
  TextInputStyle,
  ThreadAutoArchiveDuration,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type TextChannel,
  type ThreadChannel,
} from "discord.js";
import { prisma } from "@/lib/db";
import { getOrCreateDiscordConfig } from "@/lib/discord/discord";
import { createRecruitmentFromDiscord } from "@/lib/recruitment/ingest";

const FAMILY_ID = process.env.FAMILY_ID ?? "esperados";
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID ?? process.env.DISCORD_GUILD_ID ?? null;
const RECRUITMENT_INGEST_CHANNEL_ID = process.env.RECRUITMENT_INGEST_CHANNEL_ID ?? null;

// Contact panel channels
const CONTACT_CHANNEL_ID = process.env.CONTACT_CHANNEL_ID ?? null;
const TICKETS_PARENT_CHANNEL_ID = process.env.TICKETS_PARENT_CHANNEL_ID ?? null;
const TICKETS_LOGS_CHANNEL_ID = process.env.TICKETS_LOGS_CHANNEL_ID ?? null;
const PANEL_BASE_URL = process.env.PANEL_BASE_URL ?? process.env.NEXTAUTH_URL ?? "";
const INGEST_SECRET = process.env.DISCORD_INGEST_SECRET ?? "";
const ROLE_ID_REGEX = /^[0-9]{17,20}$/;
const DEFAULT_ROLE_IDS = {
  CHEF_FAMILLE_ROLE_ID: "1429607761720770623",
  ETAT_MAJOR_ROLE_ID: "1312845999366209683",
  RECRUTEUR_ROLE_ID: "1312845999215214618",
} as const;

function normalizeRoleId(value: string | undefined | null, label: keyof typeof DEFAULT_ROLE_IDS) {
  const trimmed = value ? value.trim() : "";
  if (trimmed && ROLE_ID_REGEX.test(trimmed)) return trimmed;
  if (trimmed) {
    console.warn(`[discord-bot] Invalid role id format: ${label}`);
  }
  return DEFAULT_ROLE_IDS[label];
}

const CHEF_FAMILLE_ROLE_ID = normalizeRoleId(process.env.CHEF_FAMILLE_ROLE_ID, "CHEF_FAMILLE_ROLE_ID");
const ETAT_MAJOR_ROLE_ID = normalizeRoleId(process.env.ETAT_MAJOR_ROLE_ID, "ETAT_MAJOR_ROLE_ID");
const RECRUTEUR_ROLE_ID = normalizeRoleId(process.env.RECRUTEUR_ROLE_ID, "RECRUTEUR_ROLE_ID");

const CONTACT_PANEL_MARKER = "[CONTACT_PANEL]";

if (!TOKEN) {
  console.error("Missing DISCORD_BOT_TOKEN.");
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

function sanitizeThreadName(prefix: string, ...parts: (string | null | undefined)[]) {
  const sanitized = parts
    .filter(Boolean)
    .map((p) => String(p).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 20))
    .join("-");
  const name = `${prefix}-${sanitized || "ticket"}`;
  return name.slice(0, 100);
}

function truncate(str: string, max: number) {
  if (str.length <= max) return str;
  return str.slice(0, max - 3) + "...";
}

function getStaffMentions(): string {
  const roleIds = [CHEF_FAMILLE_ROLE_ID, ETAT_MAJOR_ROLE_ID].filter(Boolean) as string[];
  if (roleIds.length === 0) return "";
  // ✅ MEGA PATCH #3: Safe role mention with validation
  return roleIds
    .map((id) => {
      // Discord IDs are 17-20 digit snowflakes
      if (!/^\d{17,20}$/.test(id)) {
        console.warn(`[getStaffMentions] Invalid roleId: ${id}`);
        return null;
      }
      return `<@&${id}>`;
    })
    .filter(Boolean)
    .join(" ");
}

async function callIngest(endpoint: string, body: Record<string, unknown>) {
  if (!PANEL_BASE_URL) {
    throw new Error("PANEL_BASE_URL not set");
  }
  if (!INGEST_SECRET) {
    throw new Error("DISCORD_INGEST_SECRET not set");
  }

  const response = await fetch(`${PANEL_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ingest-secret": INGEST_SECRET,
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPLAINT TICKET SYNC (existing functionality)
// ─────────────────────────────────────────────────────────────────────────────

type CachedConfig = {
  complaintCategoryId: string | null;
};

let cachedConfig: CachedConfig | null = null;
let cachedAt = 0;
const CONFIG_TTL_MS = 60_000;
let warnedMissingCategory = false;

type ChannelLike = {
  type?: number;
  parentId?: string | null;
  isThread?: () => boolean;
  parent?: { parentId?: string | null } | null;
  fetchParent?: () => Promise<{ parentId?: string | null } | null>;
};

async function loadConfig(): Promise<CachedConfig> {
  const now = Date.now();
  if (cachedConfig && now - cachedAt < CONFIG_TTL_MS) return cachedConfig;

  const config = await getOrCreateDiscordConfig(FAMILY_ID);
  cachedConfig = {
    complaintCategoryId: config.complaintCategoryId ?? null,
  };
  cachedAt = now;
  return cachedConfig;
}

async function isComplaintChannel(channel: ChannelLike) {
  const config = await loadConfig();
  const categoryId = config.complaintCategoryId;
  if (!categoryId) {
    if (!warnedMissingCategory) {
      console.warn("Missing Discord complaintCategoryId; no tickets will be synced.");
      warnedMissingCategory = true;
    }
    return false;
  }

  if (channel?.type === ChannelType.GuildText || channel?.type === ChannelType.GuildAnnouncement) {
    return channel.parentId === categoryId;
  }

  if (typeof channel?.isThread === "function" && channel.isThread()) {
    const parent =
      channel.parent ?? (typeof channel.fetchParent === "function" ? await channel.fetchParent().catch(() => null) : null);
    return parent?.parentId === categoryId;
  }

  return false;
}

function getAuthorNameSnapshot(message: Message) {
  if (message.member?.displayName) return message.member.displayName;
  if (message.author?.username) return message.author.username;
  return "Unknown";
}

function buildAttachments(message: Message) {
  return Array.from(message.attachments.values()).map((item) => ({
    url: item.url,
    name: item.name ?? null,
    contentType: item.contentType ?? null,
    size: item.size ?? null,
  }));
}

async function upsertTicket(message: Message) {
  const channel = message.channel;
  const channelId = channel.id;
  const config = await loadConfig();
  const categoryId = config.complaintCategoryId ?? "";
  const createdAtDiscord = message.createdAt ?? new Date();

  const updateData: Record<string, unknown> = {};
  if (message.guildId) updateData.guildId = message.guildId;
  if (categoryId) updateData.categoryId = categoryId;

  return prisma.complaintTicket.upsert({
    where: { channelId },
    create: {
      guildId: message.guildId ?? "",
      channelId,
      categoryId: categoryId || "unknown",
      createdAtDiscord,
    },
    update: updateData,
  });
}

async function recordMessage(message: Message) {
  const ticket = await upsertTicket(message);
  const attachmentsJson = buildAttachments(message);
  const authorDiscordId = message.author?.id ?? "unknown";
  const content = message.content ?? "";

  await prisma.complaintMessage.upsert({
    where: { discordMessageId: message.id },
    create: {
      ticketId: ticket.id,
      discordMessageId: message.id,
      authorDiscordId,
      authorNameSnapshot: getAuthorNameSnapshot(message),
      content,
      attachmentsJson,
      createdAtDiscord: message.createdAt ?? new Date(),
      editedAtDiscord: message.editedAt ?? null,
    },
    update: {
      content,
      editedAtDiscord: message.editedAt ?? null,
      attachmentsJson,
    },
  });
}

async function recordMessageUpdate(message: Message) {
  const ticket = await upsertTicket(message);
  const attachmentsJson = buildAttachments(message);
  const authorDiscordId = message.author?.id ?? "unknown";
  const content = message.content ?? "";

  const existing = await prisma.complaintMessage.findUnique({
    where: { discordMessageId: message.id },
  });

  if (!existing) {
    await prisma.complaintMessage.create({
      data: {
        ticketId: ticket.id,
        discordMessageId: message.id,
        authorDiscordId,
        authorNameSnapshot: getAuthorNameSnapshot(message),
        content,
        attachmentsJson,
        createdAtDiscord: message.createdAt ?? new Date(),
        editedAtDiscord: message.editedAt ?? new Date(),
      },
    });
    return;
  }

  await prisma.complaintMessage.update({
    where: { discordMessageId: message.id },
    data: {
      content,
      editedAtDiscord: message.editedAt ?? new Date(),
      attachmentsJson,
    },
  });
}

async function recordMessageDelete(message: Message) {
  const ticket = await upsertTicket(message);
  const deletedAt = new Date();

  const updated = await prisma.complaintMessage.updateMany({
    where: { discordMessageId: message.id },
    data: { deletedAtDiscord: deletedAt },
  });

  if (updated.count > 0) return;

  await prisma.complaintMessage.create({
    data: {
      ticketId: ticket.id,
      discordMessageId: message.id,
      authorDiscordId: message.author?.id ?? "unknown",
      authorNameSnapshot: getAuthorNameSnapshot(message),
      content: message.content ?? "",
      attachmentsJson: message.partial ? [] : buildAttachments(message),
      createdAtDiscord: message.createdAt ?? new Date(),
      deletedAtDiscord: deletedAt,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CLIENT
// ─────────────────────────────────────────────────────────────────────────────

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Channel],
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTACT PANEL
// ─────────────────────────────────────────────────────────────────────────────

function buildContactPanelEmbeds() {
  const recruitmentEmbed = new EmbedBuilder()
    .setTitle("🧾 Recrutement")
    .setDescription(
      "Tu souhaites rejoindre Los Esperados ?\n" +
        "Clique sur le bouton ci-dessous pour postuler.\n\n" +
        "**Conditions requises:**\n" +
        "• Avoir un Steam ID valide\n" +
        "• Connaître les règles du serveur\n" +
        "• Être motivé et actif"
    )
    .setColor(0x16a34a);

  const complaintEmbed = new EmbedBuilder()
    .setTitle("📨 Plainte")
    .setDescription(
      "Tu as un problème avec un membre de la famille ?\n" +
        "Clique sur le bouton ci-dessous pour déposer une plainte.\n\n" +
        "**Informations nécessaires:**\n" +
        "• Steam ID de la personne concernée\n" +
        "• Description détaillée\n" +
        "• Preuves (si disponibles)"
    )
    .setColor(0xdc2626);

  return [recruitmentEmbed, complaintEmbed];
}

function buildContactPanelButtons() {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("contact:recruitment")
      .setLabel("Postuler")
      .setEmoji("🧾")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("contact:complaint")
      .setLabel("Déposer une plainte")
      .setEmoji("📨")
      .setStyle(ButtonStyle.Danger)
  );
}

async function upsertContactPanel() {
  if (!CONTACT_CHANNEL_ID) {
    console.log("CONTACT_CHANNEL_ID not set, skipping contact panel.");
    return;
  }

  try {
    const channel = await client.channels.fetch(CONTACT_CHANNEL_ID);
    if (!channel || !channel.isTextBased() || channel.type !== ChannelType.GuildText) {
      console.warn("Contact channel not found or not a text channel.");
      return;
    }

    const textChannel = channel as TextChannel;
    const messages = await textChannel.messages.fetch({ limit: 50 });
    const existingPanel = messages.find(
      (msg) => msg.author.id === client.user?.id && msg.content.includes(CONTACT_PANEL_MARKER)
    );

    const embeds = buildContactPanelEmbeds();
    const components = [buildContactPanelButtons()];

    if (existingPanel) {
      await existingPanel.edit({ content: CONTACT_PANEL_MARKER, embeds, components });
      console.log("Contact panel updated.");
    } else {
      await textChannel.send({ content: CONTACT_PANEL_MARKER, embeds, components });
      console.log("Contact panel created.");
    }
  } catch (err) {
    console.error("Failed to upsert contact panel:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MODALS
// ─────────────────────────────────────────────────────────────────────────────

function buildRecruitmentModal() {
  return new ModalBuilder()
    .setCustomId("modal:recruitment")
    .setTitle("Candidature Recrutement")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("steamId")
          .setLabel("Steam ID")
          .setPlaceholder("Ex: 76561198012345678")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(50)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("rpName")
          .setLabel("Nom RP")
          .setPlaceholder("Ton nom de personnage RP")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(100)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("availabilities")
          .setLabel("Disponibilités (optionnel)")
          .setPlaceholder("Tes horaires de jeu habituels")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setMaxLength(500)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("motivation")
          .setLabel("Motivation")
          .setPlaceholder("Pourquoi veux-tu nous rejoindre ?")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMinLength(10)
          .setMaxLength(1500)
      )
    );
}

function buildComplaintModal() {
  return new ModalBuilder()
    .setCustomId("modal:complaint")
    .setTitle("Déposer une plainte")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("targetSteamId")
          .setLabel("Steam ID de la cible")
          .setPlaceholder("Ex: 76561198012345678")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(50)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("targetName")
          .setLabel("Nom RP de la cible")
          .setPlaceholder("Nom du joueur concerné")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(100)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("evidence")
          .setLabel("Lien de preuve (optionnel)")
          .setPlaceholder("Lien vers une vidéo, screenshot, etc.")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(500)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("description")
          .setLabel("Description de la plainte")
          .setPlaceholder("Décris la situation en détail...")
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMinLength(10)
          .setMaxLength(1500)
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("authorRpName")
          .setLabel("Ton nom RP (optionnel)")
          .setPlaceholder("Ton nom de personnage")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(100)
      )
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// THREAD CREATION + CLOSE BUTTONS
// ─────────────────────────────────────────────────────────────────────────────

function buildRecruitmentCloseButtons(dbId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`recruit:close:accepted:${dbId}`)
      .setLabel("Accepter")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`recruit:close:rejected:${dbId}`)
      .setLabel("Refuser")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`recruit:close:finished:${dbId}`)
      .setLabel("Terminer")
      .setEmoji("🏁")
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildComplaintCloseButtons(dbId: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`complaint:close:treated:${dbId}`)
      .setLabel("Traité")
      .setEmoji("✅")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`complaint:close:unresolved:${dbId}`)
      .setLabel("Non résolu")
      .setEmoji("⚠️")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`complaint:close:refused:${dbId}`)
      .setLabel("Refusé")
      .setEmoji("❌")
      .setStyle(ButtonStyle.Danger)
  );
}

async function createThread(parentChannelId: string, name: string) {
  const parentChannel = await client.channels.fetch(parentChannelId);
  if (!parentChannel || parentChannel.type !== ChannelType.GuildText) {
    throw new Error("Parent channel not found or not a text channel");
  }

  const textChannel = parentChannel as TextChannel;
  const thread = await textChannel.threads.create({
    name,
    autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
    reason: "Contact panel ticket",
  });

  return thread;
}

async function postLogAndArchive(params: {
  thread: ThreadChannel;
  kind: "recruitment" | "complaint";
  dbId: string;
  status: string;
  steamId: string;
  authorDiscordId: string;
  closedByDiscordId: string;
  extraFields?: { name: string; value: string }[];
}) {
  const { thread, kind, dbId, status, steamId, authorDiscordId, closedByDiscordId, extraFields } = params;

  // Post log to logs channel
  if (TICKETS_LOGS_CHANNEL_ID) {
    try {
      const logsChannel = await client.channels.fetch(TICKETS_LOGS_CHANNEL_ID);
      if (logsChannel && logsChannel.type === ChannelType.GuildText) {
        const textChannel = logsChannel as TextChannel;
        const typeLabel = kind === "recruitment" ? "🧾 Recrutement" : "📨 Plainte";
        const threadLink = `https://discord.com/channels/${thread.guildId}/${thread.id}`;
        const panelLink = PANEL_BASE_URL
          ? `${PANEL_BASE_URL}/staff/${kind === "recruitment" ? "recruitment" : "complaints"}/${dbId}`
          : null;

        const embed = new EmbedBuilder()
          .setTitle(`${typeLabel} - ${status}`)
          .setColor(status.includes("ACCEPT") || status === "TREATED" ? 0x16a34a : 0xdc2626)
          .addFields(
            { name: "Steam ID", value: steamId || "-", inline: true },
            { name: "Auteur", value: `<@${authorDiscordId}>`, inline: true },
            { name: "Clos par", value: `<@${closedByDiscordId}>`, inline: true },
            { name: "Thread", value: `[Voir le ticket](${threadLink})`, inline: false },
            ...(panelLink ? [{ name: "Panel", value: `[Voir sur le site](${panelLink})`, inline: false }] : []),
            ...(extraFields || [])
          )
          .setTimestamp();

        await textChannel.send({ embeds: [embed] });
      }
    } catch (err) {
      console.error("Failed to post log:", err);
    }
  }

  // Post close message in thread
  await thread.send(`✅ Ticket clos: **${status}** par <@${closedByDiscordId}>`);

  // Lock and archive thread
  try {
    await thread.setLocked(true);
    await thread.setArchived(true);
  } catch (err) {
    console.error("Failed to lock/archive thread:", err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERACTION HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

async function handleButtonInteraction(interaction: ButtonInteraction) {
  const customId = interaction.customId;

  // Contact panel buttons
  if (customId === "contact:recruitment") {
    await interaction.showModal(buildRecruitmentModal());
    return;
  }

  if (customId === "contact:complaint") {
    await interaction.showModal(buildComplaintModal());
    return;
  }

  // Recruitment close buttons
  if (customId.startsWith("recruit:close:")) {
    await handleRecruitmentClose(interaction);
    return;
  }

  // Complaint close buttons
  if (customId.startsWith("complaint:close:")) {
    await handleComplaintClose(interaction);
    return;
  }
}

async function handleModalSubmit(interaction: ModalSubmitInteraction) {
  if (interaction.customId === "modal:recruitment") {
    await handleRecruitmentSubmit(interaction);
    return;
  }

  if (interaction.customId === "modal:complaint") {
    await handleComplaintSubmit(interaction);
    return;
  }
}

async function handleRecruitmentSubmit(interaction: ModalSubmitInteraction) {
  const steamId = interaction.fields.getTextInputValue("steamId").trim();
  const rpName = interaction.fields.getTextInputValue("rpName").trim();
  const availabilities = interaction.fields.getTextInputValue("availabilities").trim() || null;
  const motivation = interaction.fields.getTextInputValue("motivation").trim();
  const discordId = interaction.user.id;

  if (!TICKETS_PARENT_CHANNEL_ID) {
    await interaction.reply({ content: "❌ Configuration error: TICKETS_PARENT_CHANNEL_ID not set.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    // Create thread
    const threadName = sanitizeThreadName("recrutement", steamId, rpName);
    const thread = await createThread(TICKETS_PARENT_CHANNEL_ID, threadName);

    // Call site ingest
    const result = await callIngest("/api/ingest/recruitment", {
      steamId,
      rpName,
      availabilities,
      motivation,
      screenshots: null,
      createdByDiscordId: discordId,
      discordThreadId: thread.id,
    });

    const dbId = result.id;
    const staffMention = getStaffMentions();

    // Post first message with info + close buttons
    const embed = new EmbedBuilder()
      .setTitle("🧾 Nouvelle candidature")
      .setColor(0x16a34a)
      .addFields(
        { name: "Steam ID", value: steamId, inline: true },
        { name: "Nom RP", value: rpName || "-", inline: true },
        { name: "Candidat", value: `<@${discordId}>`, inline: true },
        { name: "Disponibilités", value: truncate(availabilities || "-", 1024), inline: false },
        { name: "Motivation", value: truncate(motivation, 1024), inline: false }
      )
      .setTimestamp();

    await thread.send({
      content: staffMention ? `${staffMention} Nouvelle candidature !` : "Nouvelle candidature !",
      embeds: [embed],
      components: [buildRecruitmentCloseButtons(dbId)],
    });

    await interaction.editReply({
      content: `✅ Candidature envoyée ! Un ticket a été créé: <#${thread.id}>`,
    });
  } catch (err) {
    console.error("Recruitment submit error:", err);
    await interaction.editReply({
      content: `❌ Erreur: ${err instanceof Error ? err.message : "Échec de l'envoi"}`,
    });
  }
}

async function handleComplaintSubmit(interaction: ModalSubmitInteraction) {
  const targetSteamId = interaction.fields.getTextInputValue("targetSteamId").trim();
  const targetName = interaction.fields.getTextInputValue("targetName").trim();
  const evidence = interaction.fields.getTextInputValue("evidence").trim() || null;
  const description = interaction.fields.getTextInputValue("description").trim();
  const authorRpName = interaction.fields.getTextInputValue("authorRpName").trim() || null;
  const discordId = interaction.user.id;

  if (!TICKETS_PARENT_CHANNEL_ID) {
    await interaction.reply({ content: "❌ Configuration error: TICKETS_PARENT_CHANNEL_ID not set.", ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    // Create thread
    const threadName = sanitizeThreadName("plainte", targetSteamId, targetName);
    const thread = await createThread(TICKETS_PARENT_CHANNEL_ID, threadName);

    // Call site ingest
    const result = await callIngest("/api/ingest/complaint", {
      targetSteamId,
      targetName,
      authorRpName,
      evidence,
      description,
      createdByDiscordId: discordId,
      discordThreadId: thread.id,
    });

    const dbId = result.id;
    const staffMention = getStaffMentions();

    // Post first message with info + close buttons
    const embed = new EmbedBuilder()
      .setTitle("📨 Nouvelle plainte")
      .setColor(0xdc2626)
      .addFields(
        { name: "Cible Steam ID", value: targetSteamId, inline: true },
        { name: "Cible Nom RP", value: targetName || "-", inline: true },
        { name: "Plaignant", value: `<@${discordId}>`, inline: true },
        { name: "Nom RP plaignant", value: authorRpName || "-", inline: true },
        { name: "Preuve", value: evidence || "-", inline: false },
        { name: "Description", value: truncate(description, 1024), inline: false }
      )
      .setTimestamp();

    await thread.send({
      content: staffMention ? `${staffMention} Nouvelle plainte !` : "Nouvelle plainte !",
      embeds: [embed],
      components: [buildComplaintCloseButtons(dbId)],
    });

    await interaction.editReply({
      content: `✅ Plainte envoyée ! Un ticket a été créé: <#${thread.id}>`,
    });
  } catch (err) {
    console.error("Complaint submit error:", err);
    await interaction.editReply({
      content: `❌ Erreur: ${err instanceof Error ? err.message : "Échec de l'envoi"}`,
    });
  }
}

async function handleRecruitmentClose(interaction: ButtonInteraction) {
  // Parse customId: recruit:close:{status}:{dbId}
  const parts = interaction.customId.split(":");
  if (parts.length < 4) return;

  const statusRaw = parts[2].toUpperCase();
  const dbId = parts[3];

  const statusMap: Record<string, string> = {
    ACCEPTED: "ACCEPTED",
    REJECTED: "REJECTED",
    FINISHED: "FIN_RECRUTEMENT",
  };
  const status = statusMap[statusRaw] || "ARCHIVED";

  await interaction.deferReply({ ephemeral: true });

  try {
    // Get recruitment data for logging
    const recruitment = await prisma.recruitment.findUnique({
      where: { id: dbId },
      select: { steamId: true, discordId: true },
    });

    if (!recruitment) {
      await interaction.editReply({ content: "❌ Ticket non trouvé en base." });
      return;
    }

    // Update DB via ingest
    await callIngest("/api/ingest/ticket-close", {
      kind: "recruitment",
      id: dbId,
      status,
      closeReason: status,
      closedByDiscordId: interaction.user.id,
    });

    // Post log and archive
    const thread = interaction.channel;
    if (thread && thread.isThread()) {
      await postLogAndArchive({
        thread: thread as ThreadChannel,
        kind: "recruitment",
        dbId,
        status,
        steamId: recruitment.steamId || "-",
        authorDiscordId: recruitment.discordId,
        closedByDiscordId: interaction.user.id,
      });
    }

    await interaction.editReply({ content: `✅ Recrutement clos: ${status}` });
  } catch (err) {
    console.error("Recruitment close error:", err);
    await interaction.editReply({
      content: `❌ Erreur: ${err instanceof Error ? err.message : "Échec"}`,
    });
  }
}

async function handleComplaintClose(interaction: ButtonInteraction) {
  // Parse customId: complaint:close:{status}:{dbId}
  const parts = interaction.customId.split(":");
  if (parts.length < 4) return;

  const statusRaw = parts[2].toUpperCase();
  const dbId = parts[3];

  const statusMap: Record<string, string> = {
    TREATED: "TREATED",
    UNRESOLVED: "UNRESOLVED",
    REFUSED: "REFUSED",
  };
  const status = statusMap[statusRaw] || "CLOSED";

  await interaction.deferReply({ ephemeral: true });

  try {
    // Get complaint data for logging
    const complaint = await prisma.complaint.findUnique({
      where: { id: dbId },
      select: { targetId: true, complainantId: true },
    });

    if (!complaint) {
      await interaction.editReply({ content: "❌ Ticket non trouvé en base." });
      return;
    }

    // Update DB via ingest
    await callIngest("/api/ingest/ticket-close", {
      kind: "complaint",
      id: dbId,
      status,
      closeReason: status,
      closedByDiscordId: interaction.user.id,
    });

    // Post log and archive
    const thread = interaction.channel;
    if (thread && thread.isThread()) {
      await postLogAndArchive({
        thread: thread as ThreadChannel,
        kind: "complaint",
        dbId,
        status,
        steamId: complaint.targetId || "-",
        authorDiscordId: complaint.complainantId || "unknown",
        closedByDiscordId: interaction.user.id,
      });
    }

    await interaction.editReply({ content: `✅ Plainte close: ${status}` });
  } catch (err) {
    console.error("Complaint close error:", err);
    await interaction.editReply({
      content: `❌ Erreur: ${err instanceof Error ? err.message : "Échec"}`,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// LEGACY RECRUITMENT INGEST (command-based)
// ─────────────────────────────────────────────────────────────────────────────

async function handleRecruitmentIngest(message: Message) {
  if (!RECRUITMENT_INGEST_CHANNEL_ID) return;
  if (message.channelId !== RECRUITMENT_INGEST_CHANNEL_ID) return;
  if (!message.content?.trim().toLowerCase().startsWith("!recruit")) return;

  const rawPayload = message.content.replace(/^!recruit\s*/i, "").trim();
  let payload: Record<string, unknown> = {};
  if (rawPayload.startsWith("{")) {
    try {
      payload = JSON.parse(rawPayload);
    } catch {
      console.warn("Recruitment ingest invalid JSON payload");
      return;
    }
  } else if (rawPayload) {
    payload.candidateRpName = rawPayload;
  }

  const candidateRpName = String(payload.candidateRpName ?? "").trim();
  if (!candidateRpName) {
    console.warn("Recruitment ingest missing candidateRpName");
    return;
  }

  await createRecruitmentFromDiscord({
    candidateRpName,
    candidateAge: payload.candidateAge ? Number(payload.candidateAge) : undefined,
    candidateSteamId: payload.candidateSteamId ? String(payload.candidateSteamId) : undefined,
    candidateDiscordId: payload.candidateDiscordId ? String(payload.candidateDiscordId) : undefined,
    discordGuildId: message.guildId ?? undefined,
    discordChannelId: message.channelId ?? undefined,
    discordMessageId: message.id ?? undefined,
    raw: payload,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// EVENT HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

client.once("ready", async () => {
  console.log(`Discord bot ready as ${client.user?.tag ?? "unknown"}`);
  await upsertContactPanel();
});

client.on("interactionCreate", async (interaction) => {
  // ✅ Log ALL interactions
  console.log("[INTERACTION]", interaction.type, "id=" + interaction.id);

  try {
    if (interaction.isButton()) {
      // ✅ Log button clicks
      console.log("[BUTTON]", interaction.customId, "user=" + interaction.user?.id, "channel=" + interaction.channelId);
      
      // ✅ Defer and send debug response
      await interaction.deferUpdate().catch(console.error);
      await interaction.followUp({
        content: "✅ DEBUG: bouton reçu par le worker",
        ephemeral: true,
      }).catch(console.error);

      await handleButtonInteraction(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      await handleModalSubmit(interaction);
      return;
    }
  } catch (err) {
    console.error("Interaction handler error:", err);
  }
});

client.on("messageCreate", async (message) => {
  if (!message.guildId) return;
  if (GUILD_ID && message.guildId !== GUILD_ID) return;
  if (message.author?.bot) return;

  try {
    await handleRecruitmentIngest(message);
  } catch (err) {
    console.error("recruitment ingest failed:", err);
  }
  if (!(await isComplaintChannel(message.channel))) return;

  try {
    await recordMessage(message);
  } catch (err) {
    console.error("messageCreate failed:", err);
  }
});

client.on("messageUpdate", async (_oldMessage, newMessage) => {
  const message = newMessage.partial ? await newMessage.fetch().catch(() => null) : newMessage;
  if (!message) return;
  if (!message.guildId) return;
  if (GUILD_ID && message.guildId !== GUILD_ID) return;
  if (!(await isComplaintChannel(message.channel))) return;

  try {
    await recordMessageUpdate(message);
  } catch (err) {
    console.error("messageUpdate failed:", err);
  }
});

client.on("messageDelete", async (deletedMessage) => {
  const message = deletedMessage.partial
    ? await deletedMessage.fetch().catch(() => deletedMessage as unknown as Message)
    : deletedMessage;
  if (!message?.guildId) return;
  if (GUILD_ID && message.guildId !== GUILD_ID) return;
  if (!(await isComplaintChannel(message.channel))) return;

  try {
    await recordMessageDelete(message);
  } catch (err) {
    console.error("messageDelete failed:", err);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SHUTDOWN
// ─────────────────────────────────────────────────────────────────────────────

async function shutdown() {
  try {
    await prisma.$disconnect();
  } finally {
    client.destroy();
  }
}

process.on("SIGINT", () => {
  shutdown()
    .catch(() => null)
    .finally(() => process.exit(0));
});

process.on("SIGTERM", () => {
  shutdown()
    .catch(() => null)
    .finally(() => process.exit(0));
});

client.login(TOKEN).catch((err) => {
  console.error("Discord login failed:", err);
  process.exit(1);
});
