import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  CategoryChannel,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Guild,
  type ModalSubmitInteraction,
  type TextChannel,
  type ThreadChannel,
} from "discord.js";
import { CUSTOM_ID, IDS, EVENT_VERSION, type ComplaintCloseStatus } from "./ids.js";
import { ingest, getOpenCount } from "./ingest.js";
import { safeRoleMention } from "./mentions.js";
import { buildNickname } from "./features/rename/rules.js";

// ─────────────────────────────────────────────────────────────
// Rate limiting (anti-spam cooldown)
// ─────────────────────────────────────────────────────────────

const COOLDOWN_MS = 30_000; // 30 seconds
const createCooldowns = new Map<string, number>();

function checkCooldown(userId: string, type: "recruitment" | "complaint"): { allowed: boolean; waitMs?: number } {
  const key = `${userId}:${type}`;
  const lastCreate = createCooldowns.get(key);
  const now = Date.now();

  if (lastCreate && now - lastCreate < COOLDOWN_MS) {
    return { allowed: false, waitMs: COOLDOWN_MS - (now - lastCreate) };
  }

  return { allowed: true };
}

function setCooldown(userId: string, type: "recruitment" | "complaint") {
  const key = `${userId}:${type}`;
  createCooldowns.set(key, Date.now());

  // Cleanup old entries (every 100 entries)
  if (createCooldowns.size > 1000) {
    const now = Date.now();
    for (const [k, v] of createCooldowns) {
      if (now - v > COOLDOWN_MS * 2) {
        createCooldowns.delete(k);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────

function log(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({
    event,
    ...data,
    timestamp: new Date().toISOString(),
  }));
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function todayYYYYMMDD(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function rand4Base36(): string {
  return Math.floor(Math.random() * 36 ** 4)
    .toString(36)
    .toUpperCase()
    .padStart(4, "0");
}

function makeTicketKey(prefix: "R" | "C"): string {
  return `${prefix}-${todayYYYYMMDD()}-${rand4Base36()}`;
}

function isValidSteamId64(value: string): boolean {
  return /^7656119\d{10}$/.test(value);
}

function slugifyTicketName(value: string, fallback: string): string {
  const base = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  const safe = base || fallback;
  return safe.slice(0, 80).replace(/-+$/g, "") || fallback;
}

function buildTicketChannelName(
  type: "recruitment" | "complaint",
  authorName: string
): string {
  const prefix = type === "recruitment" ? "recrutement" : "plainte";
  const slug = slugifyTicketName(authorName, "joueur");
  return `${prefix}-${slug}`;
}


// Retry with new ticketKey on collision
async function ingestWithRetry(
  event: { type: string; ticketKey: string; threadId: string; [key: string]: unknown },
  prefix: "R" | "C"
): Promise<{ ok: true } | { ok: false; error: string }> {
  const result = await ingest(event);
  
  // If unique violation (rare), retry with new key
  if (!result.ok && result.error?.includes("Unique constraint")) {
    const newKey = makeTicketKey(prefix);
    log("ticketKey_collision_retry", { oldKey: event.ticketKey, newKey });
    event.ticketKey = newKey;
    return ingest(event);
  }
  
  return result;
}

function getPanelUrl(type: "recruitment" | "complaint", ticketKey: string): string {
  const base = IDS.PANEL_BASE_URL;
  if (type === "recruitment") {
    return `${base}/staff/recruitment?ticket=${ticketKey}`;
  }
  return `${base}/staff/complaints?ticket=${ticketKey}`;
}

function getStaffPing(guild: Guild | null): string | null {
  const mentions = [
    safeRoleMention(guild, IDS.CHEF_FAMILLE_ROLE_ID, "(rôle chef-famille)"),
    safeRoleMention(guild, IDS.SOUS_CHEF_FAMILLE_ROLE_ID, "(rôle sous-chef-famille)"),
    safeRoleMention(guild, IDS.ETAT_MAJOR_ROLE_ID, "(rôle état-major)"),
  ].filter(Boolean).join(" ");
  return mentions || null;
}

function getRecruitmentStaffPing(guild: Guild | null): string | null {
  const mentions = [
    safeRoleMention(guild, IDS.CHEF_FAMILLE_ROLE_ID, "(rôle chef-famille)"),
    safeRoleMention(guild, IDS.SOUS_CHEF_FAMILLE_ROLE_ID, "(rôle sous-chef-famille)"),
    safeRoleMention(guild, IDS.ETAT_MAJOR_ROLE_ID, "(rôle état-major)"),
    safeRoleMention(guild, IDS.RECRUTEUR_ROLE_ID, "(rôle recruteur)"),
  ].filter(Boolean).join(" ");
  return mentions || null;
}

// ─────────────────────────────────────────────────────────────
// Thread creation (Private with fallback to Public)
// ─────────────────────────────────────────────────────────────

async function createTicketThread(
  parent: TextChannel,
  name: string,
  authorId: string
): Promise<ThreadChannel | null> {
  // Try Private Thread first
  try {
    const thread = await parent.threads.create({
      name,
      autoArchiveDuration: 1440,
      type: ChannelType.PrivateThread,
      reason: "Ticket Esperados (private)",
    });

    // Add the author to the private thread
    try {
      await thread.members.add(authorId);
    } catch (e) {
      log("thread_add_author_failed", { authorId, error: e instanceof Error ? e.message : String(e) });
    }

    log("thread_created", { type: "private", name, threadId: thread.id });
    return thread;
  } catch (err) {
    log("thread_private_failed", { name, error: err instanceof Error ? err.message : String(err) });
  }

  // Fallback to Public Thread
  try {
    const thread = await parent.threads.create({
      name,
      autoArchiveDuration: 1440,
      type: ChannelType.PublicThread,
      reason: "Ticket Esperados (public fallback)",
    });

    log("thread_created", { type: "public_fallback", name, threadId: thread.id });
    return thread;
  } catch (err) {
    log("thread_public_failed", { name, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

function getComplaintStaffRoleIds(): string[] {
  return [IDS.CHEF_FAMILLE_ROLE_ID, IDS.SOUS_CHEF_FAMILLE_ROLE_ID, IDS.ETAT_MAJOR_ROLE_ID].filter(
    (roleId): roleId is string => Boolean(roleId)
  );
}

function getRecruitmentStaffRoleIds(): string[] {
  return [IDS.CHEF_FAMILLE_ROLE_ID, IDS.SOUS_CHEF_FAMILLE_ROLE_ID, IDS.ETAT_MAJOR_ROLE_ID, IDS.RECRUTEUR_ROLE_ID].filter(
    (roleId): roleId is string => Boolean(roleId)
  );
}

async function createTicketTextChannel(
  parent: CategoryChannel,
  name: string,
  type: "recruitment" | "complaint",
  authorId: string,
  guild: Guild
): Promise<TextChannel | null> {
  try {
    const me = guild.members.me ?? (await guild.members.fetchMe());
    const staffRoleIds = type === "complaint" ? getComplaintStaffRoleIds() : getRecruitmentStaffRoleIds();
    const permissionOverwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: authorId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      },
      {
        id: me.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.ManageMessages,
        ],
      },
      ...staffRoleIds.map((roleId) => ({
        id: roleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
        ],
      })),
    ];

    const channel = await guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: parent.id,
      topic: `Ticket Esperados • ${name}`,
      reason: `Ticket Esperados (${authorId})`,
      permissionOverwrites,
    });

    log("ticket_channel_created", { type: "text", name, channelId: channel.id, parentId: parent.id });
    return channel;
  } catch (err) {
    log("ticket_channel_create_failed", {
      name,
      parentId: parent.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function createTicketContainer(
  parent: TextChannel | CategoryChannel,
  name: string,
  type: "recruitment" | "complaint",
  authorId: string,
  guild: Guild
): Promise<TextChannel | ThreadChannel | null> {
  if (parent.type === ChannelType.GuildCategory) {
    return createTicketTextChannel(parent, name, type, authorId, guild);
  }

  return createTicketThread(parent, name, authorId);
}

async function resolveTicketsParentChannel(
  interaction: ModalSubmitInteraction
): Promise<TextChannel | CategoryChannel | null> {
  const configuredParent = await interaction.client.channels
    .fetch(IDS.TICKETS_PARENT_CHANNEL_ID)
    .catch(() => null);

  if (
    configuredParent?.type === ChannelType.GuildText ||
    configuredParent?.type === ChannelType.GuildCategory
  ) {
    return configuredParent;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// Anti-spam check
// ─────────────────────────────────────────────────────────────

async function checkOpenLimit(
  type: "recruitment" | "complaint",
  discordId: string
): Promise<{ allowed: boolean; message?: string }> {
  const limit = IDS.TICKETS_OPEN_LIMIT;

  const result = await getOpenCount(type, discordId);
  if (!result.ok) {
    // If check fails, allow (fail-open) but log
    console.error(`Open count check failed: ${result.error}`);
    return { allowed: true };
  }

  if (result.openCount >= limit) {
    return {
      allowed: false,
      message: `❌ Tu as déjà ${result.openCount} ticket(s) ouvert(s) de ce type. Attends qu'il(s) soi(en)t fermé(s).`,
    };
  }

  return { allowed: true };
}

// ─────────────────────────────────────────────────────────────
// Button rows for staff actions
// ─────────────────────────────────────────────────────────────

function staffComplaintRow(ticketKey: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CUSTOM_ID.STAFF_COMPLAINT_CLOSE_PREFIX}TRAITE:${ticketKey}`)
      .setLabel("✅ Traité")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${CUSTOM_ID.STAFF_COMPLAINT_CLOSE_PREFIX}NON_RESOLUE:${ticketKey}`)
      .setLabel("⏳ En attente")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${CUSTOM_ID.STAFF_COMPLAINT_CLOSE_PREFIX}REFUSE:${ticketKey}`)
      .setLabel("❌ Refusé")
      .setStyle(ButtonStyle.Danger)
  );
}

// ─────────────────────────────────────────────────────────────
// Modal openers
// ─────────────────────────────────────────────────────────────

export async function openRecruitmentModal(interaction: ButtonInteraction) {
  const modal = new ModalBuilder()
    .setCustomId(CUSTOM_ID.MODAL_RECRUIT)
    .setTitle("Recrutement");

  const steamId = new TextInputBuilder()
    .setCustomId("steamId")
    .setLabel("Steam ID (obligatoire)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Exemple : 76561198012345678")
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(50);

  const rpName = new TextInputBuilder()
    .setCustomId("rpName")
    .setLabel("Nom RP")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Exemple : Diego Alvarez")
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(100);

  const age = new TextInputBuilder()
    .setCustomId("age")
    .setLabel("Âge")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Exemple : 22")
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(3);

  const motivation = new TextInputBuilder()
    .setCustomId("motivation")
    .setLabel("Motivation")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Présente brièvement ton parcours, ta motivation et ce que tu peux apporter à la famille.")
    .setRequired(true)
    .setMinLength(10)
    .setMaxLength(1500);

  const dispo = new TextInputBuilder()
    .setCustomId("dispo")
    .setLabel("Disponibilités pour passer le recrutement")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("Indique tes disponibilités pour échanger avec le staff et passer le recrutement.")
    .setRequired(true)
    .setMinLength(5)
    .setMaxLength(500);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(steamId),
    new ActionRowBuilder<TextInputBuilder>().addComponents(rpName),
    new ActionRowBuilder<TextInputBuilder>().addComponents(age),
    new ActionRowBuilder<TextInputBuilder>().addComponents(motivation),
    new ActionRowBuilder<TextInputBuilder>().addComponents(dispo)
  );

  await interaction.showModal(modal);
}


export async function openComplaintModal(interaction: ButtonInteraction) {
  const modal = new ModalBuilder()
    .setCustomId(CUSTOM_ID.MODAL_COMPLAINT)
    .setTitle("Plainte");

  const target = new TextInputBuilder()
    .setCustomId("target")
    .setLabel("Cible (pseudo / ID Discord) (optionnel)")
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(100);

  const reason = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel("Raison")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(3)
    .setMaxLength(200);

  const details = new TextInputBuilder()
    .setCustomId("details")
    .setLabel("Détails")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMinLength(10)
    .setMaxLength(1500);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(target),
    new ActionRowBuilder<TextInputBuilder>().addComponents(reason),
    new ActionRowBuilder<TextInputBuilder>().addComponents(details)
  );

  await interaction.showModal(modal);
}

// ─────────────────────────────────────────────────────────────
// Modal submit handlers
// ─────────────────────────────────────────────────────────────

export async function handleRecruitmentSubmit(
  interaction: ModalSubmitInteraction
) {
  // Étape unique : le candidat soumet ses informations de base, le ticket est créé immédiatement.
  // Le questionnaire d’évaluation (Q1–Q22) est rempli par le recruteur depuis la fiche sur le site,
  // après création du ticket — il n’apparaît plus dans la modale candidat.

  const steamId = interaction.fields.getTextInputValue("steamId").trim();
  const rpName = interaction.fields.getTextInputValue("rpName").trim();
  const ageRaw = interaction.fields.getTextInputValue("age").trim();
  const motivation = interaction.fields.getTextInputValue("motivation").trim();
  const dispo = interaction.fields.getTextInputValue("dispo").trim();

  // Validation rapide avant de différer la réponse
  if (!isValidSteamId64(steamId)) {
    return interaction.reply({
      content: "❌ Le Steam ID fourni est invalide. Merci d’entrer un SteamID64 valide (format : 76561198XXXXXXXXX).",
      ephemeral: true,
    });
  }

  const ageParsed = parseInt(ageRaw, 10);
  if (isNaN(ageParsed) || ageParsed < 13 || ageParsed > 99) {
    return interaction.reply({
      content: "❌ L’âge fourni est invalide. Merci d’entrer un âge entre 13 et 99.",
      ephemeral: true,
    });
  }

  await interaction.deferReply({ ephemeral: true });

  // Rate limit check (cooldown)
  const cooldownCheck = checkCooldown(interaction.user.id, "recruitment");
  if (!cooldownCheck.allowed) {
    const waitSec = Math.ceil((cooldownCheck.waitMs ?? 0) / 1000);
    return interaction.editReply(`❌ Attends encore ${waitSec}s avant de créer un nouveau ticket.`);
  }

  // Anti-spam check (open count)
  const spamCheck = await checkOpenLimit("recruitment", interaction.user.id);
  if (!spamCheck.allowed) {
    return interaction.editReply(spamCheck.message!);
  }

  // Set cooldown
  setCooldown(interaction.user.id, "recruitment");

  const channelName = buildTicketChannelName("recruitment", rpName || interaction.user.username);

  const parent = await resolveTicketsParentChannel(interaction);
  if (!parent) {
    return interaction.editReply("❌ Canal parent introuvable. Contacte un membre du staff.");
  }

  let ticketKey = makeTicketKey("R");

  const thread = await createTicketContainer(
    parent,
    channelName,
    "recruitment",
    interaction.user.id,
    interaction.guild!
  );

  if (!thread) {
    log("thread_creation_failed", { type: "recruitment", userId: interaction.user.id });
    return interaction.editReply("❌ Impossible de créer le thread. Contacte un membre du staff.");
  }

  const event = {
    version: EVENT_VERSION,
    familyId: IDS.FAMILY_ID,
    type: "recruitment.create",
    ticketKey,
    threadId: thread.id,
    author: { id: interaction.user.id, tag: interaction.user.tag },
    payload: {
      steamId,
      rpName,
      age: ageParsed,
      motivation,
      dispo,
      discordUsername: interaction.user.username,
      discordDisplayName: (interaction.member as any)?.nickname || interaction.user.globalName || interaction.user.username,
    },
  };

  const ing = await ingestWithRetry(event, "R");
  ticketKey = event.ticketKey; // May have changed on retry

  // Set Discord nickname to rpName (source of truth).
  // Important : on passe par buildNickname() qui tronque à 32 chars (limite
  // Discord API). Avant on envoyait le rpName brut → BASE_TYPE_MAX_LENGTH
  // dès qu'un membre avait un nom long.
  if (rpName && interaction.guild) {
    const normalizedNick = buildNickname({ rpName });
    if (!normalizedNick) {
      log("member_nickname_update_failed", {
        userId: interaction.user.id,
        reason: "rpName_normalized_to_empty",
        ticketKey,
      });
    } else {
      try {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (member && member.manageable) {
          await member.edit({
            nick: normalizedNick,
            reason: `Recrutement ticket: ${ticketKey}`,
          });
          log("member_nickname_updated", { userId: interaction.user.id, newNick: normalizedNick, ticketKey });
        } else {
          log("member_nickname_update_failed", {
            userId: interaction.user.id,
            reason: member ? "Not manageable (role hierarchy)" : "Member not found",
            ticketKey,
          });
        }
      } catch (nickErr) {
        const error = nickErr instanceof Error ? nickErr.message : String(nickErr);
        log("member_nickname_update_error", { userId: interaction.user.id, error, ticketKey });
      }
    }
  }

  log("ticket_create", {
    type: "recruitment",
    ticketKey,
    threadId: thread.id,
    authorId: interaction.user.id,
    rpName,
    ingestOk: ing.ok,
    ingestError: ing.ok ? undefined : (ing as any).error,
  });

  const staffPing = getRecruitmentStaffPing(interaction.guild);
  const contentParts: string[] = [];
  if (staffPing) contentParts.push(`${staffPing} Nouveau recrutement !`);
  if (!ing.ok) {
    log("ticket_ingest_failed", {
      type: "recruitment",
      ticketKey,
      channelId: thread.id,
      error: (ing as any).error,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle("📌 Recrutement")
    .setDescription(
      "Merci pour ta demande de recrutement.\n" +
      "Un recruteur prendra contact avec toi ici pour la suite.\n" +
      "Le questionnaire sera conduit lors de l’entretien."
    )
    .setColor(0x3b82f6)
    .addFields(
      { name: "Auteur", value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: false },
      { name: "Nom RP", value: rpName || "-", inline: true },
      { name: "Steam ID", value: steamId || "-", inline: true },
      { name: "Âge", value: String(ageParsed), inline: true },
      { name: "Motivation", value: motivation.slice(0, 1024), inline: false },
      { name: "Disponibilités", value: dispo.slice(0, 1024), inline: false }
    )
    .setTimestamp();

  await thread.send({
    content: contentParts.length > 0 ? contentParts.join("\n") : undefined,
    embeds: [embed],
  });

  await interaction.editReply(`✅ Ticket créé : <#${thread.id}>`);
}

export async function handleComplaintSubmit(
  interaction: ModalSubmitInteraction
) {
  await interaction.deferReply({ ephemeral: true });

  // Rate limit check (cooldown)
  const cooldownCheck = checkCooldown(interaction.user.id, "complaint");
  if (!cooldownCheck.allowed) {
    const waitSec = Math.ceil((cooldownCheck.waitMs ?? 0) / 1000);
    return interaction.editReply(`❌ Attends encore ${waitSec}s avant de créer un nouveau ticket.`);
  }

  // Anti-spam check (open count)
  const spamCheck = await checkOpenLimit("complaint", interaction.user.id);
  if (!spamCheck.allowed) {
    return interaction.editReply(spamCheck.message!);
  }

  // Set cooldown
  setCooldown(interaction.user.id, "complaint");

  const target = interaction.fields.getTextInputValue("target").trim();
  const reason = interaction.fields.getTextInputValue("reason").trim();
  const details = interaction.fields.getTextInputValue("details").trim();
  const authorName =
    (interaction.member as { nickname?: string | null } | null)?.nickname ||
    interaction.user.globalName ||
    interaction.user.username;
  const channelName = buildTicketChannelName("complaint", authorName);

  const parent = await resolveTicketsParentChannel(interaction);
  if (!parent) {
    return interaction.editReply(
      "❌ Parent tickets introuvable ou pas un salon texte."
    );
  }

  let ticketKey = makeTicketKey("C");
  
  const thread = await createTicketContainer(
    parent,
    channelName,
    "complaint",
    interaction.user.id,
    interaction.guild!
  );

  // If thread creation fails entirely, inform user
  if (!thread) {
    log("thread_creation_failed", { type: "complaint", userId: interaction.user.id });
    return interaction.editReply("❌ Impossible de créer le thread. Contacte un membre du staff.");
  }

  const event = {
    version: EVENT_VERSION,
    familyId: IDS.FAMILY_ID,
    type: "complaint.create",
    ticketKey,
    threadId: thread.id,
    author: { id: interaction.user.id, tag: interaction.user.tag },
    payload: {
      target: target || null,
      reason,
      details,
      authorDisplayName:
        (interaction.member as { nickname?: string | null } | null)?.nickname ||
        interaction.user.globalName ||
        interaction.user.username,
    },
  };

  const ing = await ingestWithRetry(event, "C");
  ticketKey = event.ticketKey; // May have changed on retry

  // Log the creation
  log("ticket_create", {
    type: "complaint",
    ticketKey,
    threadId: thread.id,
    authorId: interaction.user.id,
    ingestOk: ing.ok,
    ingestError: ing.ok ? undefined : (ing as any).error,
  });

  // Build first message content
  const staffPing = getStaffPing(interaction.guild);
  const contentParts: string[] = [];
  if (staffPing) contentParts.push(`${staffPing} Nouvelle plainte !`);
  if (!ing.ok) {
    log("ticket_ingest_failed", {
      type: "complaint",
      ticketKey,
      channelId: thread.id,
      error: (ing as any).error,
    });
  }

  const embed = new EmbedBuilder()
    .setTitle("📌 Plainte")
    .setDescription("Merci pour ton signalement. Un membre du staff reviendra vers toi ici.")
    .setColor(0xef4444)
    .addFields(
      { name: "Auteur", value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: false },
      { name: "Cible", value: target || "—", inline: false },
      { name: "Raison", value: reason, inline: false },
      { name: "Détails", value: details.slice(0, 1024), inline: false }
    )
    .setTimestamp();

  await thread.send({
    content: contentParts.length > 0 ? contentParts.join("\n") : undefined,
    embeds: [embed],
    components: [staffComplaintRow(ticketKey)],
  });

  await interaction.editReply(`✅ Ticket créé : <#${thread.id}>`);
}

// ─────────────────────────────────────────────────────────────
// Close logs
// ─────────────────────────────────────────────────────────────

async function postCloseLog(opts: {
  guild: Guild;
  type: "recruitment" | "complaint";
  ticketKey: string;
  threadId: string;
  authorText?: string;
  staffText: string;
  statusText: string;
  ingestOk: boolean;
  ingestError?: string;
}) {
  try {
    const logs = await opts.guild.channels.fetch(IDS.TICKETS_LOGS_CHANNEL_ID);
    if (!logs || logs.type !== ChannelType.GuildText) return;

    const color = opts.statusText.includes("TRAITE") || opts.statusText.includes("FIN") ? 0x16a34a : 0xf59e0b;

    const embed = new EmbedBuilder()
      .setTitle("🧾 Ticket fermé")
      .setColor(color)
      .addFields(
        { name: "Type", value: opts.type, inline: true },
        { name: "Ticket", value: opts.ticketKey, inline: true },
        { name: "Status", value: opts.statusText, inline: true },
        { name: "Staff", value: opts.staffText, inline: false },
        { name: "Thread", value: `<#${opts.threadId}>`, inline: true },
        { name: "Panel", value: getPanelUrl(opts.type, opts.ticketKey), inline: true }
      )
      .setTimestamp();

    if (opts.authorText) {
      embed.addFields({ name: "Auteur ticket", value: opts.authorText, inline: false });
    }

    if (!opts.ingestOk) {
      embed.addFields({ name: "⚠️ Ingest", value: opts.ingestError ?? "KO", inline: false });
    }

    await logs.send({ embeds: [embed] });
  } catch (err) {
    console.error("Failed to post close log:", err);
  }
}

// ─────────────────────────────────────────────────────────────
// Staff button handlers
// ─────────────────────────────────────────────────────────────

export async function handleStaffButtons(interaction: ButtonInteraction) {
  // Recruitment finish
  if (interaction.customId.startsWith(CUSTOM_ID.STAFF_RECRUIT_FINISH_PREFIX)) {
    await interaction.deferReply({ ephemeral: true });
    const ticketKey = interaction.customId.replace(
      CUSTOM_ID.STAFF_RECRUIT_FINISH_PREFIX,
      ""
    );

    const thread = interaction.channel;
    if (!thread || (thread.type !== ChannelType.PublicThread && thread.type !== ChannelType.PrivateThread)) {
      return interaction.editReply("❌ Ceci doit être utilisé dans un thread.");
    }

    const event = {
      version: EVENT_VERSION,
      familyId: IDS.FAMILY_ID,
      type: "recruitment.close",
      ticketKey,
      threadId: thread.id,
      closedBy: { id: interaction.user.id, tag: interaction.user.tag },
    };

    const ing = await ingest(event);

    // Send close message in thread before locking
    try {
      await thread.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("🔒 Ticket fermé")
            .setDescription(`Clôturé par ${interaction.user.tag}`)
            .setColor(0x16a34a)
            .setTimestamp(),
        ],
      });
    } catch (e) {
      console.warn("Could not send close message:", e);
    }

    // Lock and archive
    try {
      await thread.setLocked(true);
      await thread.setArchived(true);
    } catch (err) {
      console.error("Failed to lock/archive thread:", err);
    }

    await postCloseLog({
      guild: interaction.guild!,
      type: "recruitment",
      ticketKey,
      threadId: thread.id,
      staffText: `${interaction.user.tag} (<@${interaction.user.id}>)`,
      statusText: "FIN_RECRUTEMENT",
      ingestOk: ing.ok,
      ingestError: ing.ok ? undefined : ing.error,
    });

    return interaction.editReply(
      ing.ok
        ? "✅ Recrutement clôturé."
        : `⚠️ Clôturé mais ingest KO: ${ing.error}`
    );
  }

  // Complaint close
  if (interaction.customId.startsWith(CUSTOM_ID.STAFF_COMPLAINT_CLOSE_PREFIX)) {
    await interaction.deferReply({ ephemeral: true });

    // format: ticket:complaint:close:STATUS:TICKETKEY
    const rest = interaction.customId.replace(
      CUSTOM_ID.STAFF_COMPLAINT_CLOSE_PREFIX,
      ""
    );
    const colonIdx = rest.indexOf(":");
    const status = rest.slice(0, colonIdx) as ComplaintCloseStatus;
    const ticketKey = rest.slice(colonIdx + 1);

    const thread = interaction.channel;
    if (!thread || (thread.type !== ChannelType.PublicThread && thread.type !== ChannelType.PrivateThread)) {
      return interaction.editReply("❌ Ceci doit être utilisé dans un thread.");
    }

    const event = {
      version: EVENT_VERSION,
      familyId: IDS.FAMILY_ID,
      type: "complaint.close",
      ticketKey,
      threadId: thread.id,
      closedBy: { id: interaction.user.id, tag: interaction.user.tag },
      status,
      summary: null,
    };

    const ing = await ingest(event);

    // Send close message in thread before locking
    try {
      await thread.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("🔒 Ticket fermé")
            .setDescription(`Clôturé par ${interaction.user.tag}\nStatus: **${status}**`)
            .setColor(status === "TRAITE" ? 0x16a34a : 0xf59e0b)
            .setTimestamp(),
        ],
      });
    } catch (e) {
      console.warn("Could not send close message:", e);
    }

    // Lock and archive
    try {
      await thread.setLocked(true);
      await thread.setArchived(true);
    } catch (err) {
      console.error("Failed to lock/archive thread:", err);
    }

    await postCloseLog({
      guild: interaction.guild!,
      type: "complaint",
      ticketKey,
      threadId: thread.id,
      staffText: `${interaction.user.tag} (<@${interaction.user.id}>)`,
      statusText: status,
      ingestOk: ing.ok,
      ingestError: ing.ok ? undefined : ing.error,
    });

    return interaction.editReply(
      ing.ok
        ? `✅ Plainte clôturée (${status}).`
        : `⚠️ Clôturé mais ingest KO: ${ing.error}`
    );
  }
}
