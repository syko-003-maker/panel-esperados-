"use strict";

import {
  Client,
  DiscordAPIError,
  GatewayIntentBits,
  ChannelType,
  EmbedBuilder,
} from "discord.js";
import { prisma } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import { ensureTicketHub } from "./ticketHub";
import { handleInteraction } from "./interactions";
import { handleMessage } from "./messages";

const POLL_INTERVAL_MS = 3000;
const BATCH_SIZE = 10;
const BACKOFF_MINUTES = [1, 2, 5, 10, 30];

type OutboxJob = {
  id: string;
  type: string;
  attempt: number;
  maxAttempts: number | null;
  userDiscordId: string | null;
  roleId: string | null;
  channelId: string | null;
  entityId: string | null;
  meta?: any;
};

type MarkFailureOptions = {
  forceFail?: boolean;
};

function getBackoffMinutes(attempt: number) {
  const index = Math.min(Math.max(attempt - 1, 0), BACKOFF_MINUTES.length - 1);
  return BACKOFF_MINUTES[index];
}

async function markSent(jobId: string, attempt: number, messageId: string | null) {
  await prisma.discordOutbox.update({
    where: { id: jobId },
    data: {
      status: "SENT",
      attempt,
      lastError: null,
      discordMessageId: messageId,
      sentAt: new Date(),
    },
  });
}

async function markFailure(
  job: OutboxJob,
  attempt: number,
  error: unknown,
  options?: MarkFailureOptions
) {
  const message = error instanceof Error ? error.message : String(error);
  const maxAttempts = job.maxAttempts ?? 10;
  const shouldFail = options?.forceFail ? true : attempt >= maxAttempts;

  const nextAttemptAt = shouldFail
    ? new Date()
    : new Date(Date.now() + getBackoffMinutes(attempt) * 60_000);

  await prisma.discordOutbox.update({
    where: { id: job.id },
    data: {
      status: shouldFail ? "FAILED" : "PENDING",
      attempt,
      lastError: message,
      nextAttemptAt,
    },
  });
}

async function processSanctionNotify(job: OutboxJob, client: Client, attempt: number) {
  const meta = job.meta as any;
  const kind = meta?.kind || "SANCTION_NOTIFY";

  if (!job.entityId) throw new Error("Missing sanction reference");

  if (kind === "TICKET_CREATE") {
    return handleTicketCreate(job, client, attempt);
  }

  if (kind === "TICKET_SYNC") {
    return handleTicketSync(job, client, attempt);
  }

  if (kind === "TICKET_DECISION") {
    return handleTicketDecision(job, client, attempt);
  }

  if (kind === "WHITELIST_POST") {
    return handleWhitelistPost(job, client, attempt);
  }

  if (!job.channelId) {
    console.warn("[discord-worker] Job has no channelId -> FAIL", { jobId: job.id });
    await markFailure(job, attempt, new Error("Missing channelId"), { forceFail: true });
    return;
  }

  const TOKEN = process.env.DISCORD_BOT_TOKEN;
  if (TOKEN) client.rest.setToken(TOKEN);

  const channel = await client.channels.fetch(job.channelId);
  if (!channel) throw new Error(`Channel ${job.channelId} not found`);
  if (
    channel.type !== ChannelType.GuildText &&
    channel.type !== ChannelType.GuildAnnouncement
  ) {
    throw new Error(`Channel ${job.channelId} is not a guild text/announcement channel`);
  }

  const textChannel = channel as any;

  if (kind === "RECRUITMENT_CREATED") {
    const recruitmentEmbed = {
      title: "📥 Nouveau recrutement",
      description: `**RP:** ${meta.rpName}\n**Discord:** <@${meta.discordId}>\n**Steam:** \`${meta.steamId || "Non fourni"}\``,
      color: 0x57f287,
      timestamp: meta.createdAt,
      footer: { text: "Voir dans le panel" },
    };

    const message = await textChannel.send({ embeds: [recruitmentEmbed] });
    const messageId = message?.id ?? null;

    console.log(
      `[discord-worker] job sent id=${job.id} type=${job.type} kind=${kind} channelId=${job.channelId} messageId=${messageId ?? "n/a"}`
    );
    await markSent(job.id, attempt, messageId);
    return;
  }

  if (kind === "PLAINT_CREATED") {
    const plaintEmbed = {
      title: "⚠️ Nouvelle plainte",
      description: `**Auteur:** <@${meta.authorDiscordId}>\n**Contre:** ${meta.targetDiscordId ? `<@${meta.targetDiscordId}>` : "Non spécifié"}\n**Raison:** ${meta.reason}`,
      color: 0xed4245,
      timestamp: meta.createdAt,
      footer: { text: "Voir dans le panel" },
    };

    const message = await textChannel.send({ embeds: [plaintEmbed] });
    const messageId = message?.id ?? null;

    console.log(
      `[discord-worker] job sent id=${job.id} type=${job.type} kind=${kind} channelId=${job.channelId} messageId=${messageId ?? "n/a"}`
    );
    await markSent(job.id, attempt, messageId);
    return;
  }

  if (kind === "PLAINT_DECISION") {
    const decisionEmbed = {
      title: "📋 Décision Plainte",
      description: `**Plainte:** \`${job.entityId}\`\n**Décision:** ${meta.decision}\n**Staff:** ${meta.staffName}`,
      color: 0x5865f2,
      timestamp: new Date().toISOString(),
    };

    const message = await textChannel.send({ embeds: [decisionEmbed] });
    const messageId = message?.id ?? null;

    console.log(
      `[discord-worker] job sent id=${job.id} type=${job.type} kind=${kind} channelId=${job.channelId} messageId=${messageId ?? "n/a"}`
    );
    await markSent(job.id, attempt, messageId);
    return;
  }

  const sanction = await prisma.sanction.findUnique({
    where: { id: job.entityId },
    include: { member: { select: { rpName: true, discordId: true } } },
  });
  if (!sanction) throw new Error("Sanction not found");

  if (!sanction.member?.discordId) {
    console.warn(
      "[discord-worker] Sanction member has no discordId, skipping notification",
      { sanctionId: sanction.id }
    );
    await markSent(job.id, attempt, null);
    return;
  }

  const memberName = sanction.member.rpName || "Unknown";
  const reason = sanction.reason?.trim() ? sanction.reason : "Non spécifiée";
  const duration = sanction.durationHours ? `${sanction.durationHours}h` : "Permanent";

  const embed = {
    title: "Sanction",
    description: `**Membre:** ${memberName} (<@${sanction.member.discordId}>)\n**Type:** ${sanction.type}\n**Durée:** ${duration}\n**Raison:** ${reason}${sanction.notes ? `\n**Notes:** ${sanction.notes}` : ""}`,
  };

  const message = await textChannel.send({ embeds: [embed] });
  const messageId = message?.id ?? null;

  console.log(
    `[discord-worker] job sent id=${job.id} type=${job.type} channelId=${job.channelId} messageId=${messageId ?? "n/a"}`
  );
  await markSent(job.id, attempt, messageId);
}

async function processSanctionApply(job: OutboxJob, client: Client, attempt: number) {
  if (!job.entityId) throw new Error("Missing sanction reference");

  const sanction = (await prisma.sanction.findUnique({
    where: { id: job.entityId },
    include: { member: { select: { id: true, discordId: true, rpName: true } } },
  })) as any;
  if (!sanction) throw new Error("Sanction not found");

  // Idempotence: skip if already APPLIED
  if (sanction.discordStatus === "APPLIED") {
    await markSent(job.id, attempt, null);
    return;
  }

  // Idempotence: skip if FAILED unless forceRetry is set
  if (sanction.discordStatus === "FAILED" && job.meta?.forceRetry !== true) {
    await markSent(job.id, attempt, null);
    return;
  }

  // Mark as PENDING at start of processing
  await prisma.sanction.update({
    where: { id: sanction.id },
    data: { 
      discordStatus: "PENDING",
      outboxJobId: job.id,
    } as any,
  });

  const targetDiscordId = sanction.member?.discordId ?? sanction.discordId;
  if (!targetDiscordId) {
    await prisma.sanction.update({
      where: { id: sanction.id },
      data: { discordStatus: "FAILED", discordError: "MISSING_TARGET_DISCORD_ID" } as any,
    });
    await createAuditLog({
      actorType: "worker",
      actorId: "discord-worker",
      action: "SANCTION_FAILED",
      entity: "Sanction",
      entityId: sanction.id,
      meta: { reason: "MISSING_TARGET_DISCORD_ID" },
    });
    await markFailure(job, attempt, new Error("Missing target discordId"), { forceFail: true });
    return;
  }

  const guildId = process.env.DISCORD_GUILD_ID;
  if (!guildId) throw new Error("Missing DISCORD_GUILD_ID");

  const logChannelId = process.env.SANCTION_LOG_CHANNEL_ID ?? job.channelId;
  if (!logChannelId) {
    await prisma.sanction.update({
      where: { id: sanction.id },
      data: { discordStatus: "FAILED", discordError: "SANCTION_LOG_CHANNEL_ID missing" } as any,
    });
    await createAuditLog({
      actorType: "worker",
      actorId: "discord-worker",
      action: "SANCTION_FAILED",
      entity: "Sanction",
      entityId: sanction.id,
      meta: { reason: "SANCTION_LOG_CHANNEL_ID missing" },
    });
    await markFailure(job, attempt, new Error("Missing SANCTION_LOG_CHANNEL_ID"), { forceFail: true });
    return;
  }

  const TOKEN = process.env.DISCORD_BOT_TOKEN;
  if (TOKEN) client.rest.setToken(TOKEN);

  let guild: any;
  let logChannel: any;
  let member: any = null;

  try {
    guild = await client.guilds.fetch(guildId);
  } catch (err: any) {
    await prisma.sanction.update({
      where: { id: sanction.id },
      data: { discordStatus: "FAILED", discordError: `Guild fetch failed: ${err.message}` } as any,
    });
    await createAuditLog({
      actorType: "worker",
      actorId: "discord-worker",
      action: "SANCTION_FAILED",
      entity: "Sanction",
      entityId: sanction.id,
      meta: { reason: `Guild fetch failed: ${err.message}` },
    });
    await markFailure(job, attempt, err, { forceFail: true });
    return;
  }

  try {
    logChannel = await client.channels.fetch(logChannelId);
    if (!logChannel || (logChannel.type !== ChannelType.GuildText && logChannel.type !== ChannelType.GuildAnnouncement)) {
      throw new Error("Log channel not found or not a text channel");
    }
  } catch (err: any) {
    await prisma.sanction.update({
      where: { id: sanction.id },
      data: { discordStatus: "FAILED", discordError: `Log channel error: ${err.message}` } as any,
    });
    await createAuditLog({
      actorType: "worker",
      actorId: "discord-worker",
      action: "SANCTION_FAILED",
      entity: "Sanction",
      entityId: sanction.id,
      meta: { reason: `Log channel error: ${err.message}` },
    });
    await markFailure(job, attempt, err, { forceFail: true });
    return;
  }

  member = await guild.members.fetch(targetDiscordId).catch(() => null);
  const reason = sanction.reason?.trim() || "Non spécifiée";

  let applied = false;
  let errorMessage: string | null = null;

  // Role IDs for Discord role assignments
  const ROLE_IDS = {
    AVERT_ORAL_PLAYTIME: "1343272798231199836",
    AVERT_ORAL_REUNION: "1343272736331665500",
    AVERT_LEGER: "1312845999340781640",
    AVERT_LOURD: "1312845999340781641",
    DEMOTE: "1340837563753304075",
    RESERVISTE: "1312845999366209682",
    BLACKLIST: "1338901141873758288",
    LOS_ESPERADOS: "1290707699888373832",
    CITIZEN: "1226485545055666206",
    ANCIEN_ESPERADOS: "1312846000289833050",
  };

  try {
    if (!member) throw new Error("Member not found in guild");

    if (sanction.type === "AVERT_ORAL_PLAYTIME") {
      await member.roles.add(ROLE_IDS.AVERT_ORAL_PLAYTIME);
      applied = true;
    } else if (sanction.type === "AVERT_ORAL_REUNION") {
      await member.roles.add(ROLE_IDS.AVERT_ORAL_REUNION);
      applied = true;
    } else if (sanction.type === "AVERT_LEGER") {
      await member.roles.add(ROLE_IDS.AVERT_LEGER);
      applied = true;
    } else if (sanction.type === "AVERT_LOURD") {
      await member.roles.add(ROLE_IDS.AVERT_LOURD);
      applied = true;
    } else if (sanction.type === "BLACKLIST") {
      // Set EXACTLY { BLACKLIST_ROLE_ID } - removes all other roles except @everyone
      await member.roles.set([ROLE_IDS.BLACKLIST], "Sanction: BLACKLIST");
      applied = true;
    } else if (sanction.type === "RESERVISTE") {
      // Set EXACTLY { LOS_ESPERADOS_ROLE_ID, RESERVISTE_ROLE_ID }
      await member.roles.set([ROLE_IDS.LOS_ESPERADOS, ROLE_IDS.RESERVISTE], "Sanction: RESERVISTE");
      applied = true;
    } else if (sanction.type === "DEMOTE") {
      // Set EXACTLY { CITIZEN_ROLE_ID, DEMOTE_ROLE_ID, ANCIEN_ESPERADOS_ROLE_ID }
      await member.roles.set([ROLE_IDS.CITIZEN, ROLE_IDS.DEMOTE, ROLE_IDS.ANCIEN_ESPERADOS], "Sanction: DEMOTE");
      applied = true;
    } else {
      errorMessage = `Unknown sanction type: ${sanction.type}`;
    }
  } catch (err: any) {
    applied = false;
    if (!errorMessage) {
      if (err instanceof DiscordAPIError && err.code === 50013) {
        errorMessage = `Permission denied: Missing Manage Roles (code ${err.code})`;
      } else {
        errorMessage = err?.message ?? String(err);
      }
    }
  }

  try {
    const embed = new EmbedBuilder()
      .setTitle("Sanction")
      .setDescription(
        `**Membre:** <@${targetDiscordId}>\n**Type:** ${sanction.type}\n**Raison:** ${reason}\n**Résultat:** ${applied ? "APPLIED" : "FAILED"}${errorMessage && !applied ? `\n**Erreur:** ${errorMessage}` : ""}`
      )
      .setColor(applied ? 0x57f287 : 0xed4245);

    await logChannel.send({ embeds: [embed] });
  } catch (logErr: any) {
    console.error("[processSanctionApply] Failed to send log embed:", logErr);
  }

  try {
    await prisma.sanction.update({
      where: { id: sanction.id },
      data: {
        discordStatus: applied ? "APPLIED" : "FAILED",
        discordAppliedAt: applied ? new Date() : null,
        discordError: applied ? null : errorMessage ?? "UNKNOWN_ERROR",
      } as any,
    });
  } catch (updateErr: any) {
    console.error("[processSanctionApply] Failed to update sanction:", updateErr);
  }

  try {
    await createAuditLog({
      actorType: "worker",
      actorId: "discord-worker",
      action: applied ? "SANCTION_APPLIED" : "SANCTION_FAILED",
      entity: "Sanction",
      entityId: sanction.id,
      meta: {
        memberDiscordId: targetDiscordId,
        type: sanction.type,
        reason,
        error: errorMessage ?? null,
      },
    });
  } catch (auditErr: any) {
    console.error("[processSanctionApply] Failed to create audit log:", auditErr);
  }

  if (applied) {
    await markSent(job.id, attempt, null);
  } else {
    await markFailure(job, attempt, new Error(errorMessage ?? "Failed"), { forceFail: true });
  }
}

async function processAssignRole(job: OutboxJob, client: Client, attempt: number) {
  const GUILD_ID = process.env.DISCORD_GUILD_ID;
  if (!GUILD_ID) throw new Error("Missing DISCORD_GUILD_ID");
  if (!job.userDiscordId) throw new Error("Missing user discord id");
  if (!job.roleId) throw new Error("Missing role id");

  const TOKEN = process.env.DISCORD_BOT_TOKEN;
  if (TOKEN) client.rest.setToken(TOKEN);

  const guild = await client.guilds.fetch(GUILD_ID);
  const member = await guild.members.fetch(job.userDiscordId);
  await member.roles.add(job.roleId);

  await markSent(job.id, attempt, null);
  console.log(
    `[discord-worker] job sent id=${job.id} type=${job.type} channelId=n/a messageId=n/a`
  );
}

async function handleJob(job: OutboxJob, client: Client, attempt: number) {
  if (job.type === "SANCTION_NOTIFY") return processSanctionNotify(job, client, attempt);
  if (job.type === "SANCTION_APPLY") return processSanctionApply(job, client, attempt);
  if (job.type === "ASSIGN_ROLE") return processAssignRole(job, client, attempt);
  throw new Error(`Unsupported job type ${job.type}`);
}

async function handleTicketCreate(job: OutboxJob, client: Client, attempt: number) {
  const meta = job.meta as any;
  const ticketKind = meta?.ticketKind;
  const ticketId = job.entityId;

  if (!ticketKind || !ticketId) {
    throw new Error("Missing ticketKind or ticketId for TICKET_CREATE");
  }

  const config = await prisma.discordConfig.findUnique({
    where: { familyId: "esperados" },
  });

  if (!config) {
    console.error("[discord-worker] TICKET_CREATE DiscordConfig not found");
    await markFailure(job, attempt, new Error("DiscordConfig not found"), { forceFail: true });
    return;
  }

  const parentChannelId =
    ticketKind === "COMPLAINT" ? config.complaintsChannelId : config.recruitmentChannelId;

  if (!parentChannelId) {
    console.error(`[discord-worker] TICKET_CREATE missing ${ticketKind} channelId in config`);
    await markFailure(
      job,
      attempt,
      new Error(`Missing ${ticketKind} channel in config`),
      { forceFail: true }
    );
    return;
  }

  const TOKEN = process.env.DISCORD_BOT_TOKEN;
  if (TOKEN) client.rest.setToken(TOKEN);

  const parentChannel = await client.channels.fetch(parentChannelId);
  if (!parentChannel || parentChannel.type !== ChannelType.GuildText) {
    throw new Error(`Parent channel ${parentChannelId} is not a text channel`);
  }

  // Créer thread
  const threadName =
    ticketKind === "COMPLAINT"
      ? `Plainte-${meta.title?.slice(0, 30) || ticketId.slice(0, 8)}`
      : `Recrutement-${meta.rpName?.slice(0, 30) || ticketId.slice(0, 8)}`;

  const thread = await (parentChannel as any).threads.create({
    name: threadName,
    autoArchiveDuration: 10080, // 7 days
    reason: `Ticket ${ticketKind} #${ticketId}`,
  });

  const threadId = thread.id;

  // Poster embed initial (IMPROVED)
  const embed = ticketKind === "COMPLAINT"
    ? new EmbedBuilder()
        .setTitle("🔴 Plainte — Nouveau dossier")
        .setColor(0xed4245)
        .addFields(
          { name: "📌 Titre", value: meta.title || "N/A", inline: false },
          { name: "🎯 Cible", value: meta.targetDiscordId ? `<@${meta.targetDiscordId}>` : "Non renseigné", inline: true },
          { name: "👤 Auteur", value: `<@${meta.authorDiscordId}>`, inline: true }
        )
        .setDescription(
          "La plainte a été enregistrée.\n" +
          "Merci de rester factuel et respectueux."
        )
        .setFooter({ text: "Ticket géré via le panel staff Los Esperados" })
        .setTimestamp()
    : new EmbedBuilder()
        .setTitle("🟢 Recrutement — Nouveau dossier")
        .setColor(0x57f287)
        .addFields(
          { name: "👤 RP Name", value: meta.rpName || "N/A", inline: true },
          { name: "🎮 Steam ID", value: meta.steamId || "Non renseigné", inline: true },
          { name: "🆔 Discord", value: `<@${meta.discordId}>`, inline: false }
        )
        .setDescription(
          "📸 SCREEN OBLIGATOIRE : Un membre du staff te demandera un screen de tes sanctions actives.\n\n" +
          "Merci pour ta demande. Un Etat-Major ou Chef prendra contact ici."
        )
        .setFooter({ text: "Ticket géré via le panel staff Los Esperados" })
        .setTimestamp();

  const message = await thread.send({ embeds: [embed] });
  const messageId = message?.id ?? null;

  // Mettre à jour la DB avec ticketKey = threadId
  if (ticketKind === "COMPLAINT") {
    await prisma.complaint.update({
      where: { id: ticketId },
      data: {
        ticketKey: threadId,
        discordThreadId: threadId,
        ticketChannelId: parentChannelId,
      },
    });
  } else {
    await prisma.recruitment.update({
      where: { id: ticketId },
      data: {
        ticketKey: threadId,
        discordThreadId: threadId,
        ticketChannelId: parentChannelId,
      },
    });
  }

  console.log(
    `[discord-worker] TICKET_CREATE ok kind=${ticketKind} ticketId=${ticketId} threadId=${threadId} messageId=${messageId}`
  );

  await markSent(job.id, attempt, messageId);
}

async function handleTicketSync(job: OutboxJob, client: Client, attempt: number) {
  const meta = job.meta as any;
  const ticketKind = meta?.ticketKind; // "COMPLAINT" | "RECRUITMENT"
  const ticketId = meta?.ticketId;
  const threadId = meta?.threadId;

  // Support both targeted sync (single ticket) and global sync (all open tickets)
  if (ticketKind && ticketId && threadId) {
    // Sync ciblé
    await syncSingleTicket(client, ticketKind, ticketId, threadId);
  } else {
    // Sync global: tous les tickets ouverts
    await syncAllOpenTickets(client);
  }

  console.log(
    `[discord-worker] TICKET_SYNC completed ${ticketKind ? `kind=${ticketKind} ticketId=${ticketId}` : "all open tickets"}`
  );

  await markSent(job.id, attempt, null);
}

async function syncSingleTicket(
  client: Client,
  ticketKind: string,
  ticketId: string,
  threadId: string
) {
  const TOKEN = process.env.DISCORD_BOT_TOKEN;
  if (TOKEN) client.rest.setToken(TOKEN);

  const ticket =
    ticketKind === "COMPLAINT"
      ? await prisma.complaint.findUnique({ where: { id: ticketId } })
      : await prisma.recruitment.findUnique({ where: { id: ticketId } });

  if (!ticket) {
    console.warn(`[discord-worker] syncSingleTicket ticket not found: ${ticketKind} ${ticketId}`);
    return;
  }

  const thread = await client.channels.fetch(threadId).catch(() => null);
  if (!thread || !thread.isThread()) {
    console.warn(`[discord-worker] syncSingleTicket thread not found: ${threadId}`);
    return;
  }

  // Récupérer messages depuis lastSyncedMessageId
  const lastSyncedMessageId = (ticket as any).lastSyncedMessageId;
  const fetchOptions: any = { limit: 100 };
  if (lastSyncedMessageId) {
    fetchOptions.after = lastSyncedMessageId;
  }

  const messages = await (thread as any).messages.fetch(fetchOptions);
  const messageArray = Array.from(messages.values()).reverse(); // Ordre chronologique

  let savedCount = 0;

  // TicketMessage model removed; skip message persistence.
  // We still update lastSyncedMessageId/lastSyncedAt below.

  // Mettre à jour lastSyncedMessageId et lastSyncedAt
  const latestMessageId = (messageArray as any[]).length > 0 ? (messageArray as any[])[messageArray.length - 1].id : lastSyncedMessageId;

  if (ticketKind === "COMPLAINT") {
    await prisma.complaint.update({
      where: { id: ticketId },
      data: {
        lastSyncedMessageId: latestMessageId,
        lastSyncedAt: new Date(),
      },
    });
  } else {
    await prisma.recruitment.update({
      where: { id: ticketId },
      data: {
        lastSyncedMessageId: latestMessageId,
        lastSyncedAt: new Date(),
      },
    });
  }

  console.log(
    `[discord-worker] syncSingleTicket saved ${savedCount} messages for ${ticketKind} ${ticketId}`
  );
}

async function syncAllOpenTickets(client: Client) {
  // Sync tous les tickets OPEN avec un threadId
  const complaints = await prisma.complaint.findMany({
    where: {
      status: "OPEN",
      discordThreadId: { not: null },
    },
  });

  const recruitments = await prisma.recruitment.findMany({
    where: {
      status: "PENDING",
      discordThreadId: { not: null },
    },
  });

  for (const complaint of complaints) {
    if (!complaint.discordThreadId) continue;
    await syncSingleTicket(client, "COMPLAINT", complaint.id, complaint.discordThreadId).catch(
      (err) => {
        console.error(
          `[discord-worker] syncAllOpenTickets failed for COMPLAINT ${complaint.id}:`,
          err
        );
      }
    );
  }

  for (const recruitment of recruitments) {
    if (!recruitment.discordThreadId) continue;
    await syncSingleTicket(
      client,
      "RECRUITMENT",
      recruitment.id,
      recruitment.discordThreadId
    ).catch((err) => {
      console.error(
        `[discord-worker] syncAllOpenTickets failed for RECRUITMENT ${recruitment.id}:`,
        err
      );
    });
  }

  console.log(
    `[discord-worker] syncAllOpenTickets completed: ${complaints.length} complaints, ${recruitments.length} recruitments`
  );
}

async function handleTicketDecision(job: OutboxJob, client: Client, attempt: number) {
  const meta = job.meta as any;
  const ticketKind = meta?.ticketKind; // "COMPLAINT" | "RECRUITMENT"
  const ticketKey = meta?.ticketKey; // threadId
  const decision = meta?.decision;
  const note = meta?.note;
  const staffName = meta?.staffName;

  if (!ticketKind || !ticketKey || !decision) {
    throw new Error("Missing ticketKind, ticketKey or decision for TICKET_DECISION");
  }

  const TOKEN = process.env.DISCORD_BOT_TOKEN;
  if (TOKEN) client.rest.setToken(TOKEN);

  const thread = await client.channels.fetch(ticketKey).catch(() => null);
  if (!thread || !thread.isThread()) {
    console.warn(`[discord-worker] TICKET_DECISION thread not found: ${ticketKey}`);
    await markFailure(job, attempt, new Error(`Thread ${ticketKey} not found`), { forceFail: true });
    return;
  }

  // Create decision embed (IMPROVED)
  const isComplaint = ticketKind === "COMPLAINT";
  
  let decisionEmbed;
  if (isComplaint) {
    if (decision === "TRAITE") {
      decisionEmbed = new EmbedBuilder()
        .setTitle("⚖️ Plainte traitée")
        .setColor(0xfaa61a)
        .setDescription("La plainte a été traitée par le staff.")
        .setFooter({ text: "Décision prise sur le panel staff" })
        .setTimestamp();
    } else {
      decisionEmbed = new EmbedBuilder()
        .setTitle("❌ Plainte refusée")
        .setColor(0xed4245)
        .setDescription("Après étude, la demande a été refusée.")
        .setFooter({ text: "Décision prise sur le panel staff" })
        .setTimestamp();
    }
  } else {
    if (decision === "VALID") {
      decisionEmbed = new EmbedBuilder()
        .setTitle("✅ Dossier validé")
        .setColor(0x57f287)
        .setDescription("La décision a été prise par le staff.\nBienvenue chez Los Esperados.")
        .setFooter({ text: "Décision prise sur le panel staff" })
        .setTimestamp();
    } else {
      decisionEmbed = new EmbedBuilder()
        .setTitle("❌ Dossier refusé")
        .setColor(0xed4245)
        .setDescription("Après étude, la demande a été refusée.")
        .setFooter({ text: "Décision prise sur le panel staff" })
        .setTimestamp();
    }
  }

  if (note) {
    decisionEmbed.addFields({ name: "📝 Note du staff", value: note, inline: false });
  }
  if (staffName) {
    decisionEmbed.addFields({ name: "🛡️ Staff", value: staffName, inline: true });
  }

  const message = await (thread as any).send({ embeds: [decisionEmbed] });
  const messageId = message?.id ?? null;

  // Archive thread if decision is final
  const shouldArchive = ["TRAITE", "REFUSE", "VALID"].includes(decision);
  if (shouldArchive) {
    try {
      await (thread as any).setArchived(true, `Décision finale: ${decision}`);
      console.log(`[discord-worker] TICKET_DECISION thread archived: ${ticketKey}`);
    } catch (err) {
      console.warn(`[discord-worker] TICKET_DECISION failed to archive thread ${ticketKey}:`, err);
    }
  }

  // Post staff log
  const logsChannelId = process.env.DISCORD_LOGS_CHANNEL_ID;
  if (logsChannelId) {
    try {
      const logsChannel = await client.channels.fetch(logsChannelId);
      if (logsChannel?.isTextBased?.()) {
        const logEmbed = new EmbedBuilder()
          .setTitle("📁 Ticket fermé")
          .setColor(decision === "VALID" || decision === "TRAITE" ? 0x57f287 : 0xed4245)
          .addFields(
            { name: "Type", value: isComplaint ? "Plainte" : "Recrutement", inline: true },
            { name: "Décision", value: decision, inline: true },
            { name: "Ticket ID", value: `\`${ticketKey}\``, inline: false }
          );
        if (staffName) logEmbed.addFields({ name: "Staff", value: staffName, inline: true });
        logEmbed.setFooter({ text: "Los Esperados" }).setTimestamp();
        await (logsChannel as any).send({ embeds: [logEmbed] });
      }
    } catch (err) {
      console.warn("[discord-worker] Failed to post staff log:", err);
    }
  }

  console.log(
    `[discord-worker] TICKET_DECISION ok kind=${ticketKind} decision=${decision} threadId=${ticketKey} messageId=${messageId} archived=${shouldArchive}`
  );

  await markSent(job.id, attempt, messageId);
}

async function handleWhitelistPost(job: OutboxJob, client: Client, attempt: number) {
  const meta = job.meta as any;
  const { rpName, steamId, discordId, ticketId, staffName } = meta;

  if (!steamId || !rpName) {
    throw new Error("Missing steamId or rpName for WHITELIST_POST");
  }

  const whitelistChannelId = process.env.DISCORD_WHITELIST_CHANNEL_ID;
  if (!whitelistChannelId) {
    console.warn("[discord-worker] WHITELIST_POST: No DISCORD_WHITELIST_CHANNEL_ID configured");
    await markSent(job.id, attempt, null);
    return;
  }

  const TOKEN = process.env.DISCORD_BOT_TOKEN;
  if (TOKEN) client.rest.setToken(TOKEN);

  const channel = await client.channels.fetch(whitelistChannelId);
  if (!channel) throw new Error(`Whitelist channel ${whitelistChannelId} not found`);
  if (
    channel.type !== ChannelType.GuildText &&
    channel.type !== ChannelType.GuildAnnouncement
  ) {
    throw new Error(`Whitelist channel ${whitelistChannelId} is not a text/announcement channel`);
  }

  const textChannel = channel as any;

  const embed = new EmbedBuilder()
    .setTitle("✅ Nouveau membre whitelisté")
    .setColor(0x57f287)
    .addFields(
      { name: "👤 RP Name", value: rpName, inline: true },
      { name: "🆔 Discord", value: discordId ? `<@${discordId}>` : "N/A", inline: true },
      { name: "🎮 Steam ID", value: `\`\`\`${steamId}\`\`\``, inline: false }
    )
    .setFooter({ text: `Validé par ${staffName || "Staff"}` })
    .setTimestamp();

  const message = await textChannel.send({ embeds: [embed] });
  const messageId = message?.id ?? null;

  console.log(
    `[discord-worker] whitelist posted id=${job.id} ticketId=${ticketId} channelId=${whitelistChannelId} messageId=${messageId ?? "n/a"}`
  );

  await markSent(job.id, attempt, messageId);
}

async function processExpiredSanctions(client: Client) {
  try {
    const now = new Date();

    // Find sanctions that have expired and not yet cleared
    const expiredSanctions = await prisma.sanction.findMany({
      where: {
        expiresAt: { lte: now },
        clearedAt: null,
        status: "ACTIVE",
      },
      include: {
        member: { select: { id: true, discordId: true, rpName: true } },
      },
    }) as any[];

    if (expiredSanctions.length === 0) return;

    const GUILD_ID = process.env.DISCORD_GUILD_ID;
    if (!GUILD_ID) {
      console.error("[processExpiredSanctions] Missing DISCORD_GUILD_ID");
      return;
    }

    const TOKEN = process.env.DISCORD_BOT_TOKEN;
    if (TOKEN) client.rest.setToken(TOKEN);

    const guild = await client.guilds.fetch(GUILD_ID).catch((err) => {
      console.error("[processExpiredSanctions] Failed to fetch guild:", err);
      return null;
    });

    if (!guild) return;

    const logChannelId = process.env.SANCTION_LOG_CHANNEL_ID;
    let logChannel: any = null;
    if (logChannelId) {
      logChannel = await client.channels.fetch(logChannelId).catch((err) => {
        console.error("[processExpiredSanctions] Failed to fetch log channel:", err);
        return null;
      });
    }

    // Role IDs matching processSanctionApply
    const ROLE_IDS = {
      AVERT_ORAL_PLAYTIME: "1343272798231199836",
      AVERT_ORAL_REUNION: "1343272736331665500",
      AVERT_LEGER: "1312845999340781640",
      AVERT_LOURD: "1312845999340781641",
    };

    for (const sanction of expiredSanctions) {
      const targetDiscordId = sanction.member?.discordId ?? sanction.discordId;
      if (!targetDiscordId) continue;

      try {
        const member = await guild.members.fetch(targetDiscordId).catch(() => null);
        if (!member) continue;

        const roleId = ROLE_IDS[sanction.type as keyof typeof ROLE_IDS];
        if (roleId) {
          await member.roles.remove(roleId, "Sanction expiration").catch((err) => {
            console.error(
              `[processExpiredSanctions] Failed to remove role from ${targetDiscordId}:`,
              err
            );
          });
        }

        // Mark sanction as cleared
        await prisma.sanction.update({
          where: { id: sanction.id },
          data: {
            clearedAt: now,
            clearedStatus: "APPLIED",
            clearedError: null,
          } as any,
        });

        // Create audit log
        await createAuditLog({
          actorType: "worker",
          actorId: "discord-worker",
          action: "SANCTION_CLEARED",
          entity: "Sanction",
          entityId: sanction.id,
          meta: {
            memberDiscordId: targetDiscordId,
            type: sanction.type,
            expiresAt: sanction.expiresAt.toISOString(),
          },
        });

        // Send Discord notification
        if (logChannel) {
          try {
            const durationDays = sanction.expiresAt
              ? Math.ceil(
                  (sanction.expiresAt.getTime() - sanction.startAt.getTime()) /
                    (1000 * 60 * 60 * 24)
                )
              : "?";

            const embed = new EmbedBuilder()
              .setTitle("Sanction Levée")
              .setDescription(
                `**Membre:** <@${targetDiscordId}>\n**Type:** ${sanction.type}\n**Durée:** ${durationDays}j\n**Résultat:** CLEARED`
              )
              .setColor(0x57f287);

            await logChannel.send({ embeds: [embed] }).catch((err: any) => {
              console.error(
                `[processExpiredSanctions] Failed to send notification for ${sanction.id}:`,
                err
              );
            });
          } catch (err: any) {
            console.error(
              `[processExpiredSanctions] Error sending notification for ${sanction.id}:`,
              err
            );
          }
        }
      } catch (err: any) {
        console.error(
          `[processExpiredSanctions] Error clearing sanction ${sanction.id}:`,
          err
        );

        // Mark as failed clearing
        await prisma.sanction.update({
          where: { id: sanction.id },
          data: {
            clearedAt: now,
            clearedStatus: "FAILED",
            clearedError: err instanceof Error ? err.message : String(err),
          } as any,
        });
      }
    }
  } catch (err) {
    console.error("[processExpiredSanctions] Error:", err);
  }
}

let outboxProcessing = false;
let lastExpirationCheck = 0;

async function poll(client: Client) {
  if (outboxProcessing) return;
  outboxProcessing = true;

  try {
    // Check for expired sanctions every 60 seconds
    const now = Date.now();
    if (now - lastExpirationCheck >= 60000) {
      lastExpirationCheck = now;
      await processExpiredSanctions(client);
    }

    const nowDate = new Date();

    const rows = await prisma.discordOutbox.findMany({
      where: {
        status: "PENDING",
        nextAttemptAt: { lte: nowDate },
        type: { in: ["SANCTION_NOTIFY", "SANCTION_APPLY", "ASSIGN_ROLE"] },
      },
      orderBy: { createdAt: "asc" },
      take: BATCH_SIZE,
      select: {
        id: true,
        type: true,
        attempt: true,
        maxAttempts: true,
        userDiscordId: true,
        roleId: true,
        entityId: true,
        channelId: true,
        meta: true,
      },
    });

    for (const job of rows) {
      const locked = await prisma.discordOutbox.updateMany({
        where: { id: job.id, status: "PENDING" },
        data: { status: "SENDING", attempt: job.attempt + 1 },
      });

      if (locked.count === 0) continue;

      const attempt = job.attempt + 1;

      try {
        await handleJob(job, client, attempt);
      } catch (err) {
        const isDiscordError = err instanceof DiscordAPIError;
        const fatalDiscordError =
          isDiscordError && (err.code === 50001 || err.code === 50013);
        const errorCode = isDiscordError ? err.code : "n/a";
        const statusCode = isDiscordError ? err.status : "n/a";
        const message = err instanceof Error ? err.message : String(err);
        console.error(
          `[discord-worker] job failed id=${job.id} type=${job.type} code=${errorCode} status=${statusCode} message=${message}`
        );
        await markFailure(job, attempt, err, { forceFail: fatalDiscordError });
      }
    }
  } catch (err) {
    console.error("[discord-worker] poll failed:", err);
  } finally {
    outboxProcessing = false;
  }
}

function registerShutdown(client: Client) {
  const shutdown = () => {
    prisma.$disconnect().catch(() => null);
    client.destroy();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function main() {
  const TOKEN = process.env.DISCORD_BOT_TOKEN;
  if (!TOKEN) {
    console.error("[discord-worker] Missing DISCORD_BOT_TOKEN");
    process.exit(1);
  }

  const ROLE_ID_REGEX = /^[0-9]{17,20}$/;
  const DEFAULT_ROLE_IDS = {
    CHEF_FAMILLE_ROLE_ID: "1429607761720770623",
    ETAT_MAJOR_ROLE_ID: "1312845999366209683",
    RECRUTEUR_ROLE_ID: "1312845999215214618",
  } as const;
  const normalizeRoleId = (value: string | undefined, label: keyof typeof DEFAULT_ROLE_IDS) => {
    const trimmed = value ? value.trim() : "";
    if (trimmed && ROLE_ID_REGEX.test(trimmed)) return trimmed;
    if (trimmed) {
      console.warn(`[discord-worker] roleId misconfigured: ${label}`);
    }
    return DEFAULT_ROLE_IDS[label];
  };

  const env = {
    guildId: process.env.DISCORD_GUILD_ID!,
    ticketsChannelId: process.env.DISCORD_TICKETS_CHANNEL_ID || process.env.DISCORD_TICKET_HUB_CHANNEL_ID || "",
    hubChannelId: process.env.DISCORD_TICKET_HUB_CHANNEL_ID || "",
    ticketsCategoryId: process.env.DISCORD_TICKET_CATEGORY_ID || process.env.DISCORD_TICKET_PARENT_CHANNEL_ID || "",
    logsChannelId: process.env.DISCORD_LOGS_CHANNEL_ID!,
    siteBaseUrl: process.env.SITE_BASE_URL || process.env.DISCORD_API_BASE_URL || "http://127.0.0.1:3000",
    chefFamilleRoleId: normalizeRoleId(process.env.CHEF_FAMILLE_ROLE_ID, "CHEF_FAMILLE_ROLE_ID"),
    etatMajorRoleId: normalizeRoleId(process.env.ETAT_MAJOR_ROLE_ID, "ETAT_MAJOR_ROLE_ID"),
    recruteurRoleId: normalizeRoleId(process.env.RECRUTEUR_ROLE_ID, "RECRUTEUR_ROLE_ID"),
  };

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers, // Required for guildMemberAdd/Remove/Update
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once("clientReady", async () => {
    console.log(`[discord-worker] Bot logged in as ${client.user?.tag}`);
    console.log("[discord-worker] siteBaseUrl=", env.siteBaseUrl);
    console.log("[discord-worker] roleConfig=", {
      chefFamilleConfigured: Boolean(env.chefFamilleRoleId),
      etatMajorConfigured: Boolean(env.etatMajorRoleId),
      recruteurConfigured: Boolean(env.recruteurRoleId),
    });
    console.log("[discord-worker] hubChannelId=", env.hubChannelId);
    console.log("[discord-worker] ticketsCategoryId=", env.ticketsCategoryId);
    if (env.hubChannelId) {
      await ensureTicketHub(client, env.hubChannelId);
    } else {
      console.warn("[discord-worker] No hubChannelId configured, skipping HUB setup");
    }
    setInterval(() => poll(client), POLL_INTERVAL_MS);
  });

  client.on("interactionCreate", async (interaction) => {
    // ✅ Log ALL interactions
    console.log("[INTERACTION]", interaction.type, "id=" + interaction.id);
    
    // ✅ Log button clicks
    if (interaction.isButton()) {
      console.log("[BUTTON]", interaction.customId, "user=" + interaction.user?.id, "channel=" + interaction.channelId);
    }

    await handleInteraction(interaction, env);
  });

  client.on("messageCreate", async (message) => {
    await handleMessage(message, env);
  });

  // ✅ MIRROR DISCORD STATE TO DB (avoid 429 spam on page loads)
  client.on("guildMemberAdd", async (member) => {
    if (member.guild.id !== env.guildId) return;

    const discordId = member.user.id;
    const roleIds = member.roles.cache.map((r) => r.id);

    console.log("[discord-worker] guildMemberAdd", {
      discordId: discordId.substring(0, 6) + "...",
      username: member.user.username,
      roles: roleIds.length,
    });

    try {
      await prisma.member.updateMany({
        where: { discordId },
        data: {
          discordInGuild: true,
          discordRoleIds: roleIds,
          discordRolesUpdatedAt: new Date(),
          discordLastError: null,
        },
      });
    } catch (err) {
      console.error("[discord-worker] Failed to update member on guildMemberAdd", {
        discordId: discordId.substring(0, 6) + "...",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  client.on("guildMemberRemove", async (member) => {
    if (member.guild.id !== env.guildId) return;

    const discordId = member.user.id;

    console.log("[discord-worker] guildMemberRemove", {
      discordId: discordId.substring(0, 6) + "...",
      username: member.user.username,
    });

    try {
      await prisma.member.updateMany({
        where: { discordId },
        data: {
          discordInGuild: false,
          discordRoleIds: [],
          discordRolesUpdatedAt: new Date(),
          discordLastError: null,
        },
      });
    } catch (err) {
      console.error("[discord-worker] Failed to update member on guildMemberRemove", {
        discordId: discordId.substring(0, 6) + "...",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  client.on("guildMemberUpdate", async (oldMember, newMember) => {
    if (newMember.guild.id !== env.guildId) return;

    const discordId = newMember.user.id;
    const oldRoleIds = oldMember.roles.cache.map((r) => r.id);
    const newRoleIds = newMember.roles.cache.map((r) => r.id);

    // Only update if roles actually changed
    const rolesChanged =
      oldRoleIds.length !== newRoleIds.length ||
      !oldRoleIds.every((id) => newRoleIds.includes(id));

    if (!rolesChanged) return;

    console.log("[discord-worker] guildMemberUpdate", {
      discordId: discordId.substring(0, 6) + "...",
      username: newMember.user.username,
      oldRoles: oldRoleIds.length,
      newRoles: newRoleIds.length,
    });

    try {
      await prisma.member.updateMany({
        where: { discordId },
        data: {
          discordInGuild: true,
          discordRoleIds: newRoleIds,
          discordRolesUpdatedAt: new Date(),
          discordLastError: null,
        },
      });
    } catch (err) {
      console.error("[discord-worker] Failed to update member on guildMemberUpdate", {
        discordId: discordId.substring(0, 6) + "...",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  registerShutdown(client);

  await client.login(TOKEN);
  console.log("[discord-worker] login() called, waiting for clientReady...");
}

export async function runDiscordWorker(): Promise<void> {
  await main();

  // Worker must stay alive forever
  await new Promise<void>(() => {});
}

export default { runDiscordWorker };