import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
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
    safeRoleMention(guild, IDS.ETAT_MAJOR_ROLE_ID, "(rôle état-major)"),
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

function staffRecruitmentRow(ticketKey: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CUSTOM_ID.STAFF_RECRUIT_FINISH_PREFIX}${ticketKey}`)
      .setLabel("FIN_RECRUTEMENT")
      .setStyle(ButtonStyle.Success)
  );
}

function staffComplaintRow(ticketKey: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CUSTOM_ID.STAFF_COMPLAINT_CLOSE_PREFIX}TRAITE:${ticketKey}`)
      .setLabel("TRAITÉ")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${CUSTOM_ID.STAFF_COMPLAINT_CLOSE_PREFIX}NON_RESOLUE:${ticketKey}`)
      .setLabel("NON_RÉSOLUE")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${CUSTOM_ID.STAFF_COMPLAINT_CLOSE_PREFIX}REFUSE:${ticketKey}`)
      .setLabel("REFUSÉ")
      .setStyle(ButtonStyle.Danger)
  );
}

function panelLinkRow(type: "recruitment" | "complaint", ticketKey: string) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("OUVRIR SUR LE PANEL")
      .setStyle(ButtonStyle.Link)
      .setURL(getPanelUrl(type, ticketKey))
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
    .setPlaceholder("Ex: 7656119...")
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(50);

  const rpName = new TextInputBuilder()
    .setCustomId("rpName")
    .setLabel("Nom RP")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMinLength(1)
    .setMaxLength(100);

  const motivation = new TextInputBuilder()
    .setCustomId("motivation")
    .setLabel("Motivation")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMinLength(10)
    .setMaxLength(1500);

  const dispo = new TextInputBuilder()
    .setCustomId("dispo")
    .setLabel("Disponibilités")
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMinLength(5)
    .setMaxLength(500);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(steamId),
    new ActionRowBuilder<TextInputBuilder>().addComponents(rpName),
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

  const steamId = interaction.fields.getTextInputValue("steamId").trim();
  const rpName = interaction.fields.getTextInputValue("rpName").trim();
  const motivation = interaction.fields.getTextInputValue("motivation").trim();
  const dispo = interaction.fields.getTextInputValue("dispo").trim();

  const parent = await interaction.client.channels.fetch(
    IDS.TICKETS_PARENT_CHANNEL_ID
  );
  if (!parent || parent.type !== ChannelType.GuildText) {
    return interaction.editReply(
      "❌ Parent tickets introuvable ou pas un salon texte."
    );
  }

  let ticketKey = makeTicketKey("R");
  
  const thread = await createTicketThread(
    parent,
    `recrutement-${ticketKey}`,
    interaction.user.id
  );

  // If thread creation fails entirely, inform user
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
      motivation,
      dispo,
      // ✅ PATCH: Include Discord user info for Member tracking
      discordUsername: interaction.user.username,
      discordDisplayName: (interaction.member as any)?.nickname || interaction.user.globalName || interaction.user.username,
    },
  };

  const ing = await ingestWithRetry(event, "R");
  ticketKey = event.ticketKey; // May have changed on retry

  // ✅ PATCH: Set Discord nickname to rpName (source of truth)
  if (rpName && interaction.guild) {
    try {
      const member = await interaction.guild.members.fetch(interaction.user.id);
      if (member && member.manageable) {
        await member.edit({ 
          nick: rpName,
          reason: `Recrutement ticket: ${ticketKey}` 
        });
        log("member_nickname_updated", {
          userId: interaction.user.id,
          newNick: rpName,
          ticketKey,
        });
      } else {
        log("member_nickname_update_failed", {
          userId: interaction.user.id,
          reason: member ? "Not manageable (role hierarchy)" : "Member not found",
          ticketKey,
        });
      }
    } catch (nickErr) {
      const error = nickErr instanceof Error ? nickErr.message : String(nickErr);
      log("member_nickname_update_error", {
        userId: interaction.user.id,
        error,
        ticketKey,
      });
    }
  }

  // Log the creation
  log("ticket_create", {
    type: "recruitment",
    ticketKey,
    threadId: thread.id,
    authorId: interaction.user.id,
    rpName,
    ingestOk: ing.ok,
    ingestError: ing.ok ? undefined : (ing as any).error,
  });

  // Build first message content
  const staffPing = getStaffPing(interaction.guild);
  const contentParts: string[] = [];
  if (staffPing) contentParts.push(`${staffPing} Nouveau recrutement !`);
  if (!ing.ok) contentParts.push(`⚠️ Ingest KO: ${(ing as any).error}`);

  const embed = new EmbedBuilder()
    .setTitle("� Recrutement")
    .setDescription("📸 SCREEN OBLIGATOIRE : Un membre du staff te demandera un screen de tes sanctions actives.\n\nMerci pour ta demande.\nUn État-Major ou Chef prendra contact ici.")
    .setColor(0x3b82f6)
    .addFields(
      { name: "👤 RP Name", value: rpName || "-", inline: true },
      { name: "🎮 Steam ID", value: steamId || "-", inline: true },
      { name: "🔢 Âge", value: "-", inline: true },
      { name: "⚠️ Sanctions actives", value: "0", inline: true },
      { name: "🆔 Discord", value: `<@${interaction.user.id}>`, inline: true },
      { name: "Ticket", value: ticketKey, inline: true },
      { name: "Motivation", value: motivation.slice(0, 1024), inline: false },
      { name: "Dispos", value: dispo.slice(0, 1024), inline: false }
    )
    .setFooter({ text: `Thread: discussion uniquement ici • ${ticketKey}` })
    .setTimestamp();

  await thread.send({
    content: contentParts.length > 0 ? contentParts.join("\n") : undefined,
    embeds: [embed],
    components: [staffRecruitmentRow(ticketKey), panelLinkRow("recruitment", ticketKey)],
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

  const parent = await interaction.client.channels.fetch(
    IDS.TICKETS_PARENT_CHANNEL_ID
  );
  if (!parent || parent.type !== ChannelType.GuildText) {
    return interaction.editReply(
      "❌ Parent tickets introuvable ou pas un salon texte."
    );
  }

  let ticketKey = makeTicketKey("C");
  
  const thread = await createTicketThread(
    parent,
    `plainte-${ticketKey}`,
    interaction.user.id
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
    payload: { target: target || null, reason, details },
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
  if (!ing.ok) contentParts.push(`⚠️ Ingest KO: ${(ing as any).error}`);

  const embed = new EmbedBuilder()
    .setTitle("📌 Plainte")
    .setColor(0xef4444)
    .addFields(
      { name: "Ticket", value: ticketKey, inline: true },
      { name: "Auteur", value: `${interaction.user.tag} (<@${interaction.user.id}>)`, inline: false },
      { name: "Cible", value: target || "—", inline: false },
      { name: "Raison", value: reason, inline: false },
      { name: "Détails", value: details.slice(0, 1024), inline: false }
    )
    .setFooter({ text: `Thread: discussion uniquement ici • ${ticketKey}` })
    .setTimestamp();

  await thread.send({
    content: contentParts.length > 0 ? contentParts.join("\n") : undefined,
    embeds: [embed],
    components: [staffComplaintRow(ticketKey), panelLinkRow("complaint", ticketKey)],
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
