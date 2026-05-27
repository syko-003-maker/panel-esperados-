/**
 * Slash Commands Registration & Handling
 */

import {
  REST,
  Routes,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Client,
  PermissionFlagsBits,
  EmbedBuilder,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { PrismaClient } from "@prisma/client";
import { IDS } from "./ids.js";
import { runManualSync } from "./syncRoles.js";
import { postLinkPanel } from "./contactPanel.js";
import { handleReglementPost } from "./features/reglement/reglementRole.js";
import { logAdminCommand } from "./lib/admin-command-log.js";
import {
  buildModerationCommands,
  handleBan, handleKick, handleMute,
  handleWarn, handleWarns, handleUnwarn, handleClear,
} from "./features/moderation/moderation.js";
import {
  createLinkCommand,
  handleLinkCommand,
  handleLinkButtonInteraction,
  handleLinkModalSubmission,
  createUnlinkCommand,
  handleUnlinkCommand,
  handleUnlinkButtonInteraction,
  LINK_CUSTOM_IDS,
} from "./link.js";

// ─────────────────────────────────────────────────────────────
// Prisma Setup
// ─────────────────────────────────────────────────────────────

const prisma = new PrismaClient();

// ─────────────────────────────────────────────────────────────
// Panel API Helper
// ─────────────────────────────────────────────────────────────

const PANEL_BASE_URL = process.env.INGEST_BASE_URL ?? process.env.PANEL_BASE_URL ?? "http://localhost:3000";
const WORKER_SECRET =
  process.env.INGEST_SECRET ?? process.env.DISCORD_WORKER_SECRET ?? "";
const RECRUITMENT_ANNOUNCEMENT_CHANNEL_ID = "1312846003358924874";
const RECRUITMENT_ANNOUNCEMENT_COLOR = 0x7f1d1d;

async function panelFetch(path: string, options: RequestInit = {}): Promise<any> {
  const url = `${PANEL_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      "x-ingest-secret": WORKER_SECRET,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    let text = "";
    try {
      if (contentType.includes("application/json")) {
        const json = await res.json();
        text = json.error || json.message || JSON.stringify(json).slice(0, 100);
      } else {
        text = await res.text().catch(() => "");
        // Truncate HTML to avoid log spam
        if (text.includes("<") && text.length > 100) {
          text = `${text.slice(0, 50)}... (HTML response, status ${res.status})`;
        }
      }
    } catch (e) {
      text = `(Status: ${res.status}, ${contentType || "unknown content-type"})`;
    }
    throw new Error(`Panel API error: ${res.status} ${text}`);
  }

  // ✅ SECURITY: Verify response is JSON
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(`Invalid response type: expected application/json, got ${contentType}`);
  }

  return res.json().catch((err: any) => {
    throw new Error(`Failed to parse JSON from ${url}: ${err instanceof Error ? err.message : String(err)}`);
  });
}

// ─────────────────────────────────────────────────────────────
// Command Definitions
// ─────────────────────────────────────────────────────────────

const commands = [
  // /syncroles - Staff only
  new SlashCommandBuilder()
    .setName("syncroles")
    .setDescription("Synchronise les rôles Discord avec les grades de la base de données")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false),

  // /member - Staff only
  new SlashCommandBuilder()
    .setName("member")
    .setDescription("Affiche les informations d'un membre")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("Le membre Discord à rechercher").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false),

  // /ticket - Staff only
  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Affiche les informations d'un ticket")
    .addStringOption((opt) =>
      opt.setName("ticketkey").setDescription("La clé du ticket (ex: REC-001)").setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false),

  // /sanction - Staff only
  new SlashCommandBuilder()
    .setName("sanction")
    .setDescription("Créer une sanction pour un membre")
    .addUserOption((opt) =>
      opt.setName("user").setDescription("Le membre à sanctionner").setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName("type")
        .setDescription("Type de sanction")
        .setRequired(true)
        .addChoices(
          { name: "Avertissement", value: "WARNING" },
          { name: "Sanction légère", value: "LIGHT" },
          { name: "Sanction lourde", value: "HEAVY" },
          { name: "Suspension temporaire", value: "TEMP_BAN" }
        )
    )
    .addStringOption((opt) =>
      opt.setName("reason").setDescription("Raison de la sanction").setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("duration")
        .setDescription("Durée en heures (pour TEMP_BAN)")
        .setRequired(false)
        .setMinValue(1)
        .setMaxValue(720)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false),

  // /activity - Members can use (ephemeral)
  new SlashCommandBuilder()
    .setName("activity")
    .setDescription("Affiche ton statut d'activité")
    .setDMPermission(false),

  // /link - Chef/Staff only
  createLinkCommand(),

  // /unlink - Chef/Staff only
  createUnlinkCommand(),

  // /linkpanel - Staff only - Post the link panel on demand
  new SlashCommandBuilder()
    .setName("linkpanel")
    .setDescription("Poste le panneau de liaison dans bots-famille")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false),

  new SlashCommandBuilder()
    .setName("annonce-recrutement")
    .setDescription("Envoie l'annonce de recrutement dans le salon configuré")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false),

  // Commandes de modération
  ...buildModerationCommands(),

  // /reglement-post - Staff only - (Re)poster le message règlement avec bouton acceptation
  new SlashCommandBuilder()
    .setName("reglement-post")
    .setDescription("(Re)poster le message règlement avec bouton d'acceptation")
    .addChannelOption((opt) =>
      opt.setName("salon").setDescription("Salon où poster le message (défaut : salon actuel)").setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false),

  // /syncname - Staff only - Re-sync member nickname from rpName
  new SlashCommandBuilder()
    .setName("syncname")
    .setDescription("Re-synchronise le surnom Discord d'un membre")
    .addStringOption((opt) =>
      opt
        .setName("discordid")
        .setDescription("Discord ID du membre à renommer")
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
    .setDMPermission(false),

  // /bank - Members can use, responses are PUBLIC
  // - Non-chefs can only see their own balance
  // - Chefs/Staff can see anyone's balance
  // - Unauthorized attempts show ephemeral error
  new SlashCommandBuilder()
    .setName("bank")
    .setDescription("Affiche le solde bancaire global et la dette actuelle")
    .addUserOption((opt) =>
      opt
        .setName("member")
        .setDescription("Le membre à consulter (chefs/staff seulement pour les autres)")
        .setRequired(false)
    )
    .addStringOption((opt) =>
      opt
        .setName("steamid")
        .setDescription("SteamID64 du membre (chefs/staff seulement)")
        .setRequired(false)
    )
    .setDMPermission(false),
];

// ─────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────

function log(event: string, data: Record<string, unknown> = {}) {
  console.log(
    JSON.stringify({
      event,
      ...data,
      timestamp: new Date().toISOString(),
    })
  );
}

function buildRecruitmentAnnouncementEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle("🌟 LOS ESPERADOS RECRUTE 🌟")
    .setDescription(
      `━━━━━━━━━━━━━━━━━━━━━━━

> Une famille basée sur le respect, l’organisation et l’efficacité.
> Nous cherchons des joueurs actifs et fiables pour renforcer nos rangs.

━━━━━━━━━━━━━━━━━━━━━━━

👥 **Profil recherché**
• Joueur actif et impliqué  
• Bon comportement et respect  
• Esprit d’équipe  
• Présence en jeu et en vocal appréciée  

━━━━━━━━━━━━━━━━━━━━━━━

⚖️ **Notre fonctionnement**
• Organisation claire et structurée  
• Règles simples et respectées  
• Bonne entente entre les membres  
• Chef & Etat-Major présent et à l’écoute  

━━━━━━━━━━━━━━━━━━━━━━━

📩 **Intéressé ?**
Présente-toi dans <#1312846003627622524>  
Nous étudierons ta candidature rapidement.

━━━━━━━━━━━━━━━━━━━━━━━

🔥 **Los Esperados — Sérieux, respect et cohésion.**`
    )
    .setFooter({ text: "Los Esperados" })
    .setTimestamp();
}

// ─────────────────────────────────────────────────────────────
// Staff Role Check
// ─────────────────────────────────────────────────────────────

const ROLE_ID_REGEX = /^[0-9]{17,20}$/;

function getStaffRoleIds(): string[] {
  const roleIds = IDS.STAFF_ROLE_IDS as string[];
  return roleIds.filter((id): id is string => typeof id === "string" && ROLE_ID_REGEX.test(id));
}

async function isStaff(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const staffRoleIds = getStaffRoleIds();
  if (staffRoleIds.length === 0) return true; // No staff role configured = allow

  if (!interaction.guild) return false;

  try {
    const member = await interaction.guild.members.fetch(interaction.user.id);
    return staffRoleIds.some((id) => member.roles.cache.has(id));
  } catch {
    return false;
  }
}

async function requireStaff(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const staff = await isStaff(interaction);
  if (!staff) {
    await interaction.reply({
      content: "❌ Vous n'avez pas la permission d'utiliser cette commande.",
      ephemeral: true,
    });
    return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────
// Register Commands
// ─────────────────────────────────────────────────────────────

export async function registerCommands(client: Client): Promise<void> {
  const token = process.env.DISCORD_TOKEN;
  const clientId = client.user?.id;

  if (!token || !clientId) {
    log("commands_register_skip", { reason: "Missing token or clientId" });
    return;
  }

  const rest = new REST({ version: "10" }).setToken(token);

  try {
    log("commands_register_start", { count: commands.length });

    // Register for guild only (faster updates)
    await rest.put(Routes.applicationGuildCommands(clientId, IDS.GUILD_ID), {
      body: commands.map((cmd) => cmd.toJSON()),
    });

    log("commands_register_ok", {
      commands: commands.map((c) => c.name),
      guildId: IDS.GUILD_ID,
    });
  } catch (e) {
    log("commands_register_error", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

// ─────────────────────────────────────────────────────────────
// Handle Commands
// ─────────────────────────────────────────────────────────────

export async function handleCommand(
  interaction: ChatInputCommandInteraction,
  client: Client
): Promise<void> {
  const { commandName, user } = interaction;

  log("command_received", {
    command: commandName,
    userId: user.id,
    guildId: interaction.guildId,
  });

  switch (commandName) {
    case "syncroles":
      return handleSyncRolesCommand(interaction, client);
    case "member":
      return handleMemberCommand(interaction);
    case "ticket":
      return handleTicketCommand(interaction);
    case "sanction":
      return handleSanctionCommand(interaction);
    case "activity":
      return handleActivityCommand(interaction);
    case "link":
      return handleLinkCommand(interaction);
    case "unlink":
      return handleUnlinkCommand(interaction);
    case "linkpanel":
      return handleLinkPanelCommand(interaction, client);
    case "annonce-recrutement":
      return handleRecruitmentAnnouncementCommand(interaction);
    case "syncname":
      return handleSyncNameCommand(interaction, client);
    case "bank":
      return handleBankCommand(interaction);
    case "reglement-post": {
      await handleReglementPost(interaction);
      // Audit : on log même si la commande échoue silencieusement — l'intention
      // de poster un règlement reste traçable. Le détail success/error est
      // visible dans les logs JSON du worker.
      await logAdminCommand({
        interaction,
        action: "DISCORD_REGLEMENT_POSTED",
        label: "Message de règlement (re)posté",
        targetChannelId: interaction.options.getChannel("salon")?.id ?? interaction.channelId ?? null,
        entityId: "reglement-post",
      });
      return;
    }
    case "ban":
      return handleBan(interaction);
    case "kick":
      return handleKick(interaction);
    case "mute":
      return handleMute(interaction);
    case "warn":
      return handleWarn(interaction);
    case "warns":
      return handleWarns(interaction);
    case "unwarn":
      return handleUnwarn(interaction);
    case "clear":
      return handleClear(interaction);
    default:
      await interaction.reply({
        content: "❌ Commande inconnue.",
        ephemeral: true,
      });
  }
}

// ─────────────────────────────────────────────────────────────
// /syncroles Handler
// ─────────────────────────────────────────────────────────────

async function handleSyncRolesCommand(
  interaction: ChatInputCommandInteraction,
  client: Client
): Promise<void> {
  if (!(await requireStaff(interaction))) return;

  await interaction.deferReply({ ephemeral: true });

  try {
    const result = await runManualSync(client);

    const embed = new EmbedBuilder()
      .setTitle("🔄 Synchronisation des rôles terminée")
      .setColor(result.errors > 0 ? 0xffa500 : 0x00ff00)
      .addFields([
        { name: "Total membres", value: String(result.total), inline: true },
        { name: "Synchronisés", value: String(result.synced), inline: true },
        { name: "Ignorés", value: String(result.skipped), inline: true },
        { name: "Erreurs", value: String(result.errors), inline: true },
      ])
      .setFooter({ text: `Exécuté par ${interaction.user.tag}` })
      .setTimestamp();

    if (result.changes.length > 0 && result.changes.length <= 10) {
      const changesText = result.changes
        .map((c) => {
          const parts: string[] = [];
          if (c.added.length > 0) parts.push(`+${c.added.length} rôle(s)`);
          if (c.removed.length > 0) parts.push(`-${c.removed.length} rôle(s)`);
          return `• ${c.rpName ?? c.discordId}: ${parts.join(", ")}`;
        })
        .join("\n");

      embed.addFields({ name: "Changements", value: changesText.slice(0, 1024), inline: false });
    } else if (result.changes.length > 10) {
      embed.addFields({
        name: "Changements",
        value: `${result.changes.length} membres modifiés (voir logs)`,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });

    log("syncroles_command_ok", {
      userId: interaction.user.id,
      total: result.total,
      synced: result.synced,
      errors: result.errors,
    });
  } catch (e) {
    log("syncroles_command_error", {
      userId: interaction.user.id,
      error: e instanceof Error ? e.message : String(e),
    });

    await interaction.editReply({
      content: `❌ Erreur: ${e instanceof Error ? e.message : "Erreur inconnue"}`,
    });
  }
}

// ─────────────────────────────────────────────────────────────
// /linkpanel Handler
// ─────────────────────────────────────────────────────────────

async function handleLinkPanelCommand(
  interaction: ChatInputCommandInteraction,
  client: Client
): Promise<void> {
  if (!(await requireStaff(interaction))) return;

  await interaction.deferReply({ ephemeral: true });

  const result = await postLinkPanel(client);

  if (result.ok) {
    await interaction.editReply({
      content: `✅ Panneau de liaison posté dans <#${IDS.BOTS_FAMILLE_CHANNEL_ID}> (message ${result.messageId}).`,
    });
    // Audit : trace dans logs Discord + DB panel
    await logAdminCommand({
      interaction,
      action: "DISCORD_LINKPANEL_POSTED",
      label: "Panneau de liaison Discord posté",
      detail: result.messageId ? `Message ID : \`${result.messageId}\`` : undefined,
      targetChannelId: IDS.BOTS_FAMILLE_CHANNEL_ID,
      entityId: "linkpanel",
    });
    return;
  }

  await interaction.editReply({
    content: `❌ Impossible de poster le panneau: ${result.error ?? "Erreur inconnue"}`,
  });
}

async function handleRecruitmentAnnouncementCommand(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  if (!(await requireStaff(interaction))) return;

  await interaction.deferReply({ ephemeral: true });

  try {
    if (!interaction.guild) {
      await interaction.editReply({
        content: "Impossible de trouver ou d'écrire dans le salon des annonces.",
      });
      return;
    }

    const channel = await interaction.guild.channels.fetch(RECRUITMENT_ANNOUNCEMENT_CHANNEL_ID);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
      await interaction.editReply({
        content: "Impossible de trouver ou d'écrire dans le salon des annonces.",
      });
      return;
    }

    const botMember = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());
    const permissions = channel.permissionsFor(botMember);

    if (
      !permissions?.has(PermissionFlagsBits.ViewChannel) ||
      !permissions.has(PermissionFlagsBits.SendMessages) ||
      !permissions.has(PermissionFlagsBits.EmbedLinks)
    ) {
      await interaction.editReply({
        content: "Impossible de trouver ou d'écrire dans le salon des annonces.",
      });
      return;
    }

    await channel.send({ embeds: [buildRecruitmentAnnouncementEmbed()] });

    await interaction.editReply({
      content: "L’annonce de recrutement a bien été envoyée dans le salon configuré.",
    });

    log("recruitment_announcement_command_ok", {
      userId: interaction.user.id,
      guildId: interaction.guildId,
      channelId: RECRUITMENT_ANNOUNCEMENT_CHANNEL_ID,
    });

    // Trace dans #logs Discord + AuditLog panel — pour savoir qui a posté
    // l'annonce sans avoir à fouiller les logs JSON du worker.
    await logAdminCommand({
      interaction,
      action: "DISCORD_ANNOUNCEMENT_POSTED",
      label: "Annonce de recrutement publiée",
      detail: "Embed de recrutement posté dans le salon des annonces.",
      targetChannelId: RECRUITMENT_ANNOUNCEMENT_CHANNEL_ID,
      entityId: "annonce-recrutement",
    });
  } catch (e) {
    log("recruitment_announcement_command_error", {
      userId: interaction.user.id,
      guildId: interaction.guildId,
      channelId: RECRUITMENT_ANNOUNCEMENT_CHANNEL_ID,
      error: e instanceof Error ? e.message : String(e),
    });

    await interaction.editReply({
      content: "Impossible de trouver ou d'écrire dans le salon des annonces.",
    });
  }
}

// ─────────────────────────────────────────────────────────────
// /member Handler
// ─────────────────────────────────────────────────────────────

async function handleMemberCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!(await requireStaff(interaction))) return;

  await interaction.deferReply({ ephemeral: true });

  const targetUser = interaction.options.getUser("user", true);

  try {
    const data = await panelFetch(`/api/discord/member?discordId=${targetUser.id}`);

    if (!data.ok) {
      await interaction.editReply({
        content: `❌ ${data.error ?? "Membre non trouvé"}`,
      });
      return;
    }

    const m = data.member;
    const activity = m.activity;

    const statusEmoji =
      activity?.status === "OK" ? "🟢" : activity?.status === "WARN" ? "🟡" : activity?.status === "KO" ? "🔴" : "⚪";

    const embed = new EmbedBuilder()
      .setTitle(`👤 ${m.rpName ?? "Membre inconnu"}`)
      .setColor(m.isActive ? 0x00ff00 : 0xff0000)
      .setThumbnail(targetUser.displayAvatarURL())
      .addFields([
        { name: "Discord ID", value: m.discordId ?? "—", inline: true },
        { name: "Steam ID", value: m.steamId ?? "—", inline: true },
        { name: "Grade", value: m.grade ?? "—", inline: true },
        { name: "Statut", value: m.isActive ? "✅ Actif" : "❌ Inactif", inline: true },
        {
          name: "Activité",
          value: activity
            ? `${statusEmoji} ${activity.status}\n📊 ${activity.playtimeMinutes ?? 0} min\n📅 ${activity.meetingsMissed ?? 0} réunion(s) manquée(s)`
            : "Aucune donnée",
          inline: true,
        },
        {
          name: "Sanctions actives",
          value: String(m.activeSanctionsCount ?? 0),
          inline: true,
        },
      ])
      .setFooter({ text: `Rejoint le ${m.joinedAt ? new Date(m.joinedAt).toLocaleDateString("fr-FR") : "—"}` })
      .setTimestamp();

    // Add links
    const links: string[] = [];
    if (m.links?.member) links.push(`[📋 Fiche membre](${m.links.member})`);
    if (m.links?.sanctions) links.push(`[⚠️ Sanctions](${m.links.sanctions})`);
    if (m.links?.activity) links.push(`[📊 Activité](${m.links.activity})`);

    if (links.length > 0) {
      embed.addFields({ name: "Liens", value: links.join(" • "), inline: false });
    }

    await interaction.editReply({ embeds: [embed] });

    log("member_command_ok", { userId: interaction.user.id, targetId: targetUser.id });
  } catch (e) {
    log("member_command_error", {
      userId: interaction.user.id,
      targetId: targetUser.id,
      error: e instanceof Error ? e.message : String(e),
    });

    await interaction.editReply({
      content: `❌ Erreur: ${e instanceof Error ? e.message : "Erreur inconnue"}`,
    });
  }
}

// ─────────────────────────────────────────────────────────────
// /ticket Handler
// ─────────────────────────────────────────────────────────────

async function handleTicketCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!(await requireStaff(interaction))) return;

  await interaction.deferReply({ ephemeral: true });

  const ticketKey = interaction.options.getString("ticketkey", true);

  try {
    const data = await panelFetch(`/api/discord/ticket?ticketKey=${encodeURIComponent(ticketKey)}`);

    if (!data.ok) {
      await interaction.editReply({
        content: `❌ ${data.error ?? "Ticket non trouvé"}`,
      });
      return;
    }

    const t = data.ticket;

    const typeEmoji = t.type === "RECRUITMENT" ? "📝" : "📢";
    const statusColor =
      t.status === "PENDING" || t.status === "OPEN"
        ? 0xffa500
        : t.status === "ACCEPTED" || t.status === "RESOLVED"
          ? 0x00ff00
          : 0xff0000;

    const embed = new EmbedBuilder()
      .setTitle(`${typeEmoji} ${t.ticketKey}`)
      .setColor(statusColor)
      .addFields([
        { name: "Type", value: t.type === "RECRUITMENT" ? "Recrutement" : "Plainte", inline: true },
        { name: "Statut", value: t.status, inline: true },
        {
          name: "Sujet",
          value: t.rpName ?? t.targetRpName ?? "—",
          inline: true,
        },
        {
          name: "Créé le",
          value: new Date(t.createdAt).toLocaleString("fr-FR"),
          inline: true,
        },
      ])
      .setTimestamp();

    // Add links
    const links: string[] = [];
    if (t.links?.panel) links.push(`[📋 Panel](${t.links.panel})`);
    if (t.links?.thread) links.push(`[💬 Thread](${t.links.thread})`);

    if (links.length > 0) {
      embed.addFields({ name: "Liens", value: links.join(" • "), inline: false });
    }

    await interaction.editReply({ embeds: [embed] });

    log("ticket_command_ok", { userId: interaction.user.id, ticketKey });
  } catch (e) {
    log("ticket_command_error", {
      userId: interaction.user.id,
      ticketKey,
      error: e instanceof Error ? e.message : String(e),
    });

    await interaction.editReply({
      content: `❌ Erreur: ${e instanceof Error ? e.message : "Erreur inconnue"}`,
    });
  }
}

// ─────────────────────────────────────────────────────────────
// /sanction Handler
// ─────────────────────────────────────────────────────────────

async function handleSanctionCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!(await requireStaff(interaction))) return;

  await interaction.deferReply({ ephemeral: true });

  const targetUser = interaction.options.getUser("user", true);
  const type = interaction.options.getString("type", true);
  const reason = interaction.options.getString("reason", true);
  const durationHours = interaction.options.getInteger("duration") ?? undefined;

  try {
    const data = await panelFetch("/api/discord/sanctions", {
      method: "POST",
      body: JSON.stringify({
        discordId: targetUser.id,
        type,
        reason,
        durationHours,
        staffDiscordId: interaction.user.id,
      }),
    });

    if (!data.ok) {
      await interaction.editReply({
        content: `❌ ${data.error ?? "Échec de création de la sanction"}`,
      });
      return;
    }

    const s = data.sanction;

    const typeLabel =
      type === "WARNING"
        ? "⚠️ Avertissement"
        : type === "LIGHT"
          ? "🟡 Sanction légère"
          : type === "HEAVY"
            ? "🔴 Sanction lourde"
            : "🚫 Suspension temporaire";

    const embed = new EmbedBuilder()
      .setTitle("✅ Sanction créée")
      .setColor(0xff0000)
      .addFields([
        { name: "Membre", value: `${s.memberRpName ?? "—"} (<@${targetUser.id}>)`, inline: true },
        { name: "Type", value: typeLabel, inline: true },
        { name: "Raison", value: reason.slice(0, 500), inline: false },
      ])
      .setFooter({ text: `Créé par ${interaction.user.tag}` })
      .setTimestamp();

    if (durationHours && s.endAt) {
      embed.addFields({
        name: "Durée",
        value: `${durationHours}h (expire le ${new Date(s.endAt).toLocaleString("fr-FR")})`,
        inline: true,
      });
    }

    if (s.links?.panel) {
      embed.addFields({ name: "Lien", value: `[📋 Voir dans le panel](${s.links.panel})`, inline: false });
    }

    await interaction.editReply({ embeds: [embed] });

    log("sanction_command_ok", {
      userId: interaction.user.id,
      targetId: targetUser.id,
      sanctionId: s.id,
      type,
    });
  } catch (e) {
    log("sanction_command_error", {
      userId: interaction.user.id,
      targetId: targetUser.id,
      error: e instanceof Error ? e.message : String(e),
    });

    await interaction.editReply({
      content: `❌ Erreur: ${e instanceof Error ? e.message : "Erreur inconnue"}`,
    });
  }
}

// ─────────────────────────────────────────────────────────────
// /activity Handler (Members)
// ─────────────────────────────────────────────────────────────

async function handleActivityCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ ephemeral: true });

  try {
    const data = await panelFetch(`/api/discord/activity?discordId=${interaction.user.id}`);

    if (!data.ok) {
      await interaction.editReply({
        content: `❌ ${data.error ?? "Aucune donnée d'activité trouvée. Es-tu membre de la famille?"}`,
      });
      return;
    }

    const a = data.activity;
    const snapshot = a.snapshot;
    const member = a.member;

    const statusEmoji =
      snapshot?.status === "OK" ? "🟢" : snapshot?.status === "WARN" ? "🟡" : snapshot?.status === "KO" ? "🔴" : "⚪";

    const embed = new EmbedBuilder()
      .setTitle(`📊 Ton activité`)
      .setColor(snapshot?.status === "OK" ? 0x00ff00 : snapshot?.status === "WARN" ? 0xffa500 : 0xff0000)
      .addFields([
        { name: "RP Name", value: member?.rpName ?? "—", inline: true },
        { name: "Grade", value: member?.grade ?? "—", inline: true },
        { name: "Statut", value: snapshot ? `${statusEmoji} ${snapshot.status}` : "Pas de données", inline: true },
      ])
      .setTimestamp();

    if (snapshot) {
      embed.addFields([
        { name: "Temps de jeu", value: `${snapshot.playtimeMinutes ?? 0} minutes`, inline: true },
        {
          name: "Réunions",
          value: `${snapshot.meetings.attended}/${snapshot.meetings.total} présent(e)`,
          inline: true,
        },
        {
          name: "Période",
          value: `${new Date(snapshot.period.start).toLocaleDateString("fr-FR")} - ${new Date(snapshot.period.end).toLocaleDateString("fr-FR")}`,
          inline: true,
        },
      ]);
    }

    if (a.pendingAbsences > 0) {
      embed.addFields({
        name: "⏳ Absences en attente",
        value: `Tu as ${a.pendingAbsences} demande(s) d'absence en attente de validation.`,
        inline: false,
      });
    }

    if (snapshot?.status === "KO" || snapshot?.status === "WARN") {
      const tips: string[] = [];
      if (snapshot.meetings.missed > 0) {
        tips.push(`• Tu as manqué ${snapshot.meetings.missed} réunion(s)`);
      }
      if (snapshot.playtimeMinutes < 60) {
        tips.push(`• Ton temps de jeu est faible`);
      }
      if (tips.length > 0) {
        tips.push(`\n💡 Tu peux justifier une absence via le panel.`);
        embed.addFields({ name: "Conseils", value: tips.join("\n"), inline: false });
      }
    }

    if (a.links?.justify) {
      embed.addFields({
        name: "Liens",
        value: `[📝 Justifier une absence](${a.links.justify})`,
        inline: false,
      });
    }

    await interaction.editReply({ embeds: [embed] });

    log("activity_command_ok", { userId: interaction.user.id, status: snapshot?.status });
  } catch (e) {
    log("activity_command_error", {
      userId: interaction.user.id,
      error: e instanceof Error ? e.message : String(e),
    });

    await interaction.editReply({
      content: `❌ Erreur: ${e instanceof Error ? e.message : "Erreur inconnue"}`,
    });
  }
}

// ─────────────────────────────────────────────────────────────
// /syncname Handler - Staff only
// ─────────────────────────────────────────────────────────────

async function handleSyncNameCommand(
  interaction: ChatInputCommandInteraction,
  client: Client
): Promise<void> {
  if (!(await requireStaff(interaction))) return;

  await interaction.deferReply({ ephemeral: true });

  try {
    if (!WORKER_SECRET) {
      await interaction.editReply({
        content:
          "❌ INGEST_SECRET manquant côté worker. Contactez un administrateur.",
      });
      return;
    }

    const discordId = interaction.options.getString("discordid", true);

    log("syncname_command", {
      userId: interaction.user.id,
      targetDiscordId: discordId,
    });

    // Fetch member from panel API
    const memberResponse = await fetch(
      `${PANEL_BASE_URL}/api/ingest/members/by-discord/${discordId}`,
      {
        headers: {
          "x-ingest-secret": WORKER_SECRET,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!memberResponse.ok) {
      if (memberResponse.status === 404) {
        await interaction.editReply({
          content: "❌ Membre non trouvé dans la base de données.",
        });
        return;
      }
      throw new Error(
        `Fetch failed: ${memberResponse.status} ${memberResponse.statusText}`
      );
    }

    const memberData = await memberResponse.json();
    if (!memberData.ok || !memberData.member) {
      await interaction.editReply({
        content: "❌ Erreur lors de la récupération du membre.",
      });
      return;
    }

    const member = memberData.member;
    const rpName = member.rpName;

    // Attempt rename via panel endpoint (which calls worker)
    const renameResponse = await fetch(`${PANEL_BASE_URL}/api/ingest/rename-member`, {
      method: "POST",
      headers: {
        "x-ingest-secret": WORKER_SECRET,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        discordId,
        rpName,
        reason: `Manual sync by ${interaction.user.tag}`,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const renameData = await renameResponse.json();

    log("syncname_result", {
      targetDiscordId: discordId,
      rpName,
      ok: renameData.ok,
      skipped: renameData.skipped,
      error: renameData.error,
    });

    let message = "";
    if (renameData.ok && !renameData.skipped) {
      message = `✅ Renommé en **${renameData.nickname}**`;
    } else if (renameData.skipped === "NO_RPNAME") {
      message = "⚠️ Pas de nom RP (rpName vide)";
    } else if (renameData.skipped === "ALREADY_OK") {
      message = `✅ Déjà renommé en **${renameData.nickname}**`;
    } else if (renameData.skipped === "NO_PERMISSION") {
      message = "⚠️ Bot ne peut pas renommer (permission ManageNicknames manquante)";
    } else if (renameData.skipped === "ROLE_HIERARCHY") {
      message = "⚠️ Impossible de renommer: le rôle du bot n'est pas assez haut";
    } else if (renameData.skipped === "MEMBER_NOT_FOUND") {
      message = "⚠️ Membre non trouvé sur le serveur";
    } else if (!renameData.ok) {
      message = `❌ Erreur: ${renameData.error || "Impossible de renommer"}`;
    }

    await interaction.editReply({
      content: message || "❓ Résultat inconnu",
    });
  } catch (error) {
    log("syncname_error", {
      userId: interaction.user.id,
      error: error instanceof Error ? error.message : String(error),
    });

    await interaction.editReply({
      content: `❌ Erreur: ${error instanceof Error ? error.message : "Erreur inconnue"}`,
    });
  }
}

// ─────────────────────────────────────────────────────────────
// /bank Handler
// ─────────────────────────────────────────────────────────────

interface GlobalBalance {
  totalDeposits: number;
  totalWithdrawals: number;
  balance: number;
  debt: number;
}

/**
 * Compute global lifetime balance for a steamId
 * - Sums all deposits (type = 2)
 * - Sums all withdrawals (type = 1)
 * - Returns balance and debt
 */
async function computeGlobalBalance(steamId: string): Promise<GlobalBalance> {
  const [deposits, withdrawals] = await Promise.all([
    prisma.bankLog.aggregate({
      where: { steamId, type: 2 },
      _sum: { money: true },
    }),
    prisma.bankLog.aggregate({
      where: { steamId, type: 1 },
      _sum: { money: true },
    }),
  ]);

  const totalDeposits = deposits._sum.money ?? 0;
  const totalWithdrawals = withdrawals._sum.money ?? 0;
  const balance = totalDeposits - totalWithdrawals;
  const debt = balance < 0 ? Math.abs(balance) : 0;

  return {
    totalDeposits,
    totalWithdrawals,
    balance,
    debt,
  };
}

/**
 * Check if user is chef/staff (can view anyone's balance)
 */
async function isChefOrStaff(userId: string, guild: any): Promise<boolean> {
  if (!guild) return false;

  try {
    const member = await guild.members.fetch(userId);
    if (!member) return false;

    const chefRoleIds = [IDS.CHEF_FAMILLE_ROLE_ID, IDS.SOUS_CHEF_FAMILLE_ROLE_ID].filter(Boolean) as string[];
    const staffRoleIds = (IDS.STAFF_ROLE_IDS as string[]) || [];

    // Check if has chef/sous-chef or any staff role
    const hasChefRole = chefRoleIds.some((id) => member.roles.cache.has(id));
    const hasStaffRole = staffRoleIds.some((id) => member.roles.cache.has(id));

    return hasChefRole || hasStaffRole;
  } catch {
    return false;
  }
}

async function handleBankCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const requesterId = interaction.user.id;
    const targetUser = interaction.options.getUser("member");
    const targetSteamIdRaw = interaction.options.getString("steamid");
    const targetSteamId = targetSteamIdRaw?.trim() ?? "";
    let targetDiscordId = requesterId; // Default to requester
    let resolvedSteamId: string | null = null;

    // Determine if viewing someone else's account
    const isViewingOther = targetUser && targetUser.id !== requesterId;
    const isUsingSteamId = Boolean(targetSteamId);

    // Authorization check BEFORE deferReply
    const wantsOtherMember = isViewingOther || isUsingSteamId;
    const isAuthorized = wantsOtherMember
      ? await isChefOrStaff(requesterId, interaction.guild)
      : false;

    if (wantsOtherMember && !isAuthorized) {
      await interaction.reply({
        content: "❌ Seuls les chefs peuvent consulter un autre membre.",
        ephemeral: true,
      });
      return;
    }

    if (targetUser && targetUser.id !== requesterId) {
      targetDiscordId = targetUser.id;
    }

    if (targetSteamId) {
      resolvedSteamId = targetSteamId;
    }

    // All valid cases (self or authorized other) => PUBLIC response
    await interaction.deferReply({ ephemeral: false });

    // Get target member from database
    const targetMember = resolvedSteamId
      ? await prisma.member.findFirst({
          where: { steamId: resolvedSteamId },
          select: { steamId: true, rpName: true, discordUsername: true, discordId: true },
        })
      : await prisma.member.findFirst({
          where: { discordId: targetDiscordId },
          select: { steamId: true, rpName: true, discordUsername: true, discordId: true },
        });

    if (!targetMember || !targetMember.steamId) {
      await interaction.editReply({
        content: "❌ Membre non trouvé ou pas de SteamID lié.",
      });
      return;
    }

    // Compute global balance
    const balance = await computeGlobalBalance(targetMember.steamId);

    log("bank_command", {
      requesterId,
      targetDiscordId,
      steamId: targetMember.steamId,
      totalDeposits: balance.totalDeposits,
      totalWithdrawals: balance.totalWithdrawals,
      debt: balance.debt,
    });

    // Build clean, public embed
    const displayName = targetMember.rpName
      || targetMember.discordUsername
      || targetUser?.tag
      || targetMember.discordId
      || targetDiscordId
      || "Membre";
    const isDebt = balance.debt > 0;

    const fmtMoney = (n: number) => Math.trunc(n).toLocaleString("fr-FR");
    const formatDate = (d: Date) => d.toLocaleString("fr-BE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Brussels",
    });

    const embed = new EmbedBuilder()
      .setTitle(`Banque — ${displayName}`)
      .setDescription(`Solde global (historique complet) pour ${displayName}`)
      .setColor(balance.balance >= 0 ? 0x2ECC71 : 0xE74C3C)
      .addFields(
        {
          name: "✅ Total dépôts",
          value: `${fmtMoney(balance.totalDeposits)}$`,
          inline: true,
        },
        {
          name: "❌ Total retraits",
          value: `${fmtMoney(balance.totalWithdrawals)}$`,
          inline: true,
        },
        {
          name: "💰 Solde",
          value: balance.balance >= 0
            ? `+${fmtMoney(balance.balance)}$`
            : `-${fmtMoney(Math.abs(balance.balance))}$`,
          inline: true,
        },
      )
      .setFooter({
        text: `SteamID: ${targetMember.steamId ?? "N/A"} • ${formatDate(new Date())}`,
      });

    if (isDebt) {
      embed.addFields({
        name: "📉 Dette globale",
        value: `${fmtMoney(balance.debt)}$`,
        inline: true,
      });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    log("bank_error", {
      userId: interaction.user.id,
      error: error instanceof Error ? error.message : String(error),
    });

    await interaction.editReply({
      content: `❌ Erreur: ${error instanceof Error ? error.message : "Erreur inconnue"}`,
    });
  }
}
