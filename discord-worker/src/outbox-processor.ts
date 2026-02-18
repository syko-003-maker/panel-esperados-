import type { PrismaClient } from "@prisma/client";
import type { Client as DiscordClient, TextChannel } from "discord.js";
import { EmbedBuilder } from "discord.js";
import { safeFetchMember, validateDiscordId } from "./utils/validateDiscordId.js";

type OutboxJob = {
  id: string;
  type: string;
  status: string;
  meta: Record<string, any>;
  entityId: string;
  entity: string;
};

function log(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, ...data, timestamp: new Date().toISOString() }));
}

export async function processOutboxQueue(
  prisma: PrismaClient,
  discordClient: DiscordClient
): Promise<void> {
  try {
    const jobs = await prisma.discordOutbox.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    if (jobs.length === 0) return;

    log("outbox_poll", { pending: jobs.length });

    for (const job of jobs) {
      try {
        await processJob(job as any, prisma, discordClient);
      } catch (error) {
        log("outbox_job_error", {
          jobId: job.id,
          type: job.type,
          error: error instanceof Error ? error.message : String(error),
        });

        await prisma.discordOutbox.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            attempt: job.attempt + 1,
            lastError: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }
  } catch (error) {
    log("outbox_poll_error", { error: error instanceof Error ? error.message : String(error) });
  }
}

async function processJob(
  job: OutboxJob,
  prisma: PrismaClient,
  discordClient: DiscordClient
): Promise<void> {
  const logsChannelId = process.env.TICKETS_LOGS_CHANNEL_ID;
  if (!logsChannelId) {
    throw new Error("TICKETS_LOGS_CHANNEL_ID not configured");
  }

  const logsChannel = await discordClient.channels.fetch(logsChannelId);
  if (!logsChannel || !logsChannel.isTextBased()) {
    throw new Error("Logs channel not found or not text-based");
  }

  switch (job.type) {
    case "RECRUITMENT_DECISION":
      await handleRecruitmentDecision(job, logsChannel as TextChannel);
      break;

    case "SANCTION_APPLY":
      await handleSanctionApply(job, discordClient);
      break;

    case "COMPLAINT_DECISION":
      await handleComplaintDecision(job, logsChannel as TextChannel);
      break;

    case "SEND_MESSAGE":
      await handleGenericMessage(job, logsChannel as TextChannel);
      break;

    case "SANCTION_NOTIFY":
      await handleSanctionNotify(job, logsChannel as TextChannel);
      break;

    default:
      log("outbox_unknown_type", { jobId: job.id, type: job.type });
  }

  await prisma.discordOutbox.update({
    where: { id: job.id },
    data: { status: "SENT", sentAt: new Date() },
  });

  log("outbox_job_completed", { jobId: job.id, type: job.type });
}

async function handleRecruitmentDecision(job: OutboxJob, channel: TextChannel): Promise<void> {
  const { decision, candidateRpName, totalOn20, totalPoints } = job.meta;

  const embed = new EmbedBuilder()
    .setTitle(`📋 Décision Recrutement`)
    .setColor(decision === "ACCEPT" ? 0x10b981 : 0xef4444)
    .addFields(
      { name: "Candidat", value: candidateRpName || "Unknown", inline: true },
      { name: "Décision", value: decision === "ACCEPT" ? "✅ ACCEPTÉ" : "❌ REFUSÉ", inline: true },
      { name: "Score", value: `${totalOn20 ?? "-"}/20 (${totalPoints ?? "-"} pts)`, inline: true }
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

async function handleComplaintDecision(job: OutboxJob, channel: TextChannel): Promise<void> {
  const { decision, complaintTitle } = job.meta;

  const labels = {
    APPROVED: { label: "✅ APPROUVÉE", color: 0x10b981 },
    REJECTED: { label: "❌ REJETÉE", color: 0xef4444 },
    DISMISSED: { label: "🚫 CLASSÉE SANS SUITE", color: 0x6b7280 },
  };

  const decisionInfo = labels[decision as keyof typeof labels] || {
    label: decision,
    color: 0x6b7280,
  };

  const embed = new EmbedBuilder()
    .setTitle(`📝 Décision Plainte`)
    .setColor(decisionInfo.color)
    .addFields(
      { name: "Titre", value: complaintTitle || "Sans titre", inline: false },
      { name: "Décision", value: decisionInfo.label, inline: true }
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

async function handleSanctionApply(job: OutboxJob, discordClient: DiscordClient): Promise<void> {
  const { discordId, sanctionType, memberName } = job.meta;

  // Get guild
  const guildId = process.env.GUILD_ID;
  if (!guildId) throw new Error("GUILD_ID not configured");

  const guild = await discordClient.guilds.fetch(guildId);
  
  // ✅ Validate and fetch member safely
  const validation = validateDiscordId(discordId);
  if (!validation.valid) {
    throw new Error(`Invalid discordId: ${validation.error}`);
  }
  
  const member = await safeFetchMember(guild, validation.discordId, "sanction_apply");

  if (!member) {
    throw new Error(`Member ${validation.discordId} not found in guild (error code 10007)`);
  }

  // Apply sanction based on type
  // This is a simplified implementation - expand based on your sanction types
  log("sanction_apply", { discordId, sanctionType, memberName });

  // Example: Remove specific roles, apply timeout, etc.
  // You'll need to implement the actual logic based on your sanction types

  // Update sanction in DB
  // This assumes you have access to prisma here
  // You may need to pass it or import it
}

async function handleSanctionNotify(job: OutboxJob, channel: TextChannel): Promise<void> {
  const { action, type, memberName, reason } = job.meta;

  const embed = new EmbedBuilder()
    .setTitle(`⚖️ Sanction ${action}`)
    .setColor(0xf59e0b)
    .addFields(
      { name: "Membre", value: memberName || "Unknown", inline: true },
      { name: "Type", value: type, inline: true },
      { name: "Raison", value: reason || "-", inline: false }
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

async function handleGenericMessage(job: OutboxJob, channel: TextChannel): Promise<void> {
  const { message } = job.meta;
  if (message) {
    await channel.send(String(message));
  }
}
