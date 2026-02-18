/**
 * Recruitment Decision Handler
 * Handles APPROVE/REFUSE buttons on recruitment tickets from Discord
 */

import {
  ButtonInteraction,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Guild,
  type TextChannel,
} from "discord.js";
import { startJob, finishJob } from "./lib/job-idempotence.js";
import { logInfo, logWarn, logError } from "./lib/worker-obs.js";
import { IDS } from "./ids.js";

const PANEL_URL = process.env.INGEST_BASE_URL || "http://localhost:3000";
const LOG_CHANNEL_ID = process.env.RECRUITMENT_LOG_CHANNEL_ID || null;

interface RecruitmentDecisionParams {
  ticketKey: string;
  decision: "APPROVE" | "REFUSE";
}

function parseRecruitmentCustomId(customId: string): RecruitmentDecisionParams | null {
  // Format: ticket:recruitment:finish:TICKETKEY
  // BUT we need to support decision buttons, so let's handle both formats
  // Current format from tickets.ts: ticket:recruitment:finish:TICKETKEY
  // We'll add new format: recruitment:decide:DECISION:TICKETKEY
  
  if (customId.startsWith("recruitment:decide:")) {
    const parts = customId.split(":");
    if (parts.length < 4) return null;
    
    const decision = parts[2].toUpperCase();
    const ticketKey = parts.slice(3).join(":");
    
    if (!["APPROVE", "REFUSE"].includes(decision)) return null;
    if (!ticketKey) return null;
    
    return { ticketKey, decision: decision as "APPROVE" | "REFUSE" };
  }
  
  // Legacy format: ticket:recruitment:finish:TICKETKEY
  // We'll treat this as APPROVE for backwards compatibility
  if (customId.startsWith("ticket:recruitment:finish:")) {
    const ticketKey = customId.replace("ticket:recruitment:finish:", "");
    if (!ticketKey) return null;
    return { ticketKey, decision: "APPROVE" };
  }
  
  return null;
}

/**
 * Call panel API to record decision
 */
async function callDecisionAPI(
  ticketKey: string,
  decision: "APPROVE" | "REFUSE",
  staffDiscordId: string,
  staffUsername: string,
  messageId?: string,
  channelId?: string
): Promise<{ ok: boolean; data?: any; error?: string }> {
  try {
    const ingestSecret = process.env.INGEST_SECRET;
    if (!ingestSecret) {
      logError("recruitment_ingest_secret_missing", { ticketKey });
      return { ok: false, error: "INGEST_SECRET not configured" };
    }

    const url = `${PANEL_URL}/api/discord/recruitment/decide`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ingest-secret": ingestSecret,
      },
      body: JSON.stringify({
        ticketKey,
        decision,
        staffDiscordId,
        staffUsername,
        messageId,
        channelId,
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      return { ok: false, error: data.error || `HTTP ${response.status}` };
    }
    
    return { ok: true, data };
  } catch (error) {
    logError("recruitment_api_call_failed", { ticketKey, decision }, error as Error);
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Build decision embed
 */
function buildDecisionEmbed(params: {
  ticketKey: string;
  decision: "APPROVE" | "REFUSE";
  candidateName: string;
  steamId?: string;
  staffTag: string;
  staffRpName?: string;
}): EmbedBuilder {
  const { ticketKey, decision, candidateName, steamId, staffTag, staffRpName } = params;
  
  const isApproved = decision === "APPROVE";
  const color = isApproved ? 0x22c55e : 0xef4444; // Green or Red
  const emoji = isApproved ? "✅" : "❌";
  const title = `${emoji} Recrutement — ${isApproved ? "Accepté" : "Refusé"}`;
  
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .addFields(
      { name: "👤 Candidat", value: candidateName, inline: true },
      { name: "🎫 Ticket", value: `\`${ticketKey}\``, inline: true },
      { name: "📋 Décision", value: isApproved ? "**ACCEPTÉ**" : "**REFUSÉ**", inline: true }
    )
    .setTimestamp();
  
  if (steamId) {
    embed.addFields({ name: "🛠️ SteamID64", value: `\`${steamId}\``, inline: false });
  }
  
  const staffText = staffRpName ? `${staffRpName} (${staffTag})` : staffTag;
  embed.setFooter({ text: `Décidé par ${staffText}` });
  
  return embed;
}

/**
 * Post decision log to log channel
 */
async function postDecisionLog(params: {
  guild: Guild;
  ticketKey: string;
  decision: "APPROVE" | "REFUSE";
  candidateName: string;
  steamId?: string;
  staffTag: string;
  staffRpName?: string;
  threadId?: string;
}): Promise<void> {
  if (!LOG_CHANNEL_ID) {
    logWarn("recruitment_log_channel_missing", { ticketKey: params.ticketKey });
    return;
  }
  
  try {
    const channel = await params.guild.channels.fetch(LOG_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) {
      logWarn("recruitment_log_channel_invalid", { channelId: LOG_CHANNEL_ID });
      return;
    }
    
    const embed = buildDecisionEmbed(params);
    
    let content = `📌 **Recrutement ${params.decision === "APPROVE" ? "Accepté" : "Refusé"}**`;
    if (params.threadId) {
      content += ` • Thread: <#${params.threadId}>`;
    }
    
    await (channel as TextChannel).send({ content, embeds: [embed] });
    
    logInfo("recruitment_log_posted", { ticketKey: params.ticketKey, channelId: LOG_CHANNEL_ID });
  } catch (error) {
    logError("recruitment_log_post_failed", { ticketKey: params.ticketKey }, error as Error);
  }
}

/**
 * Main handler for recruitment decision buttons
 */
export async function handleRecruitmentDecision(
  interaction: ButtonInteraction
): Promise<void> {
  const staffDiscordId = interaction.user.id;
  const staffTag = interaction.user.tag;
  const messageId = interaction.message?.id;
  const channelId = interaction.channelId;
  
  // ✅ IMMEDIATE ACK - deferUpdate to prevent Discord timeout
  try {
    await interaction.deferUpdate();
  } catch (ackError) {
    logError("recruitment_ack_failed", { customId: interaction.customId }, ackError as Error);
    return;
  }
  
  // Parse customId
  const params = parseRecruitmentCustomId(interaction.customId);
  if (!params) {
    logWarn("recruitment_invalid_custom_id", { customId: interaction.customId, userId: staffDiscordId });
    await interaction.followUp({
      content: "❌ Format de bouton invalide.",
      ephemeral: true,
    });
    return;
  }
  
  const { ticketKey, decision } = params;
  
  logInfo("recruitment_decide_start", { ticketKey, decision, staffDiscordId, staffTag });
  
  // Idempotence check
  const jobKey = `RECRUITMENT_DECIDE:${ticketKey}:${decision}`;
  const canStart = await startJob(jobKey, "RECRUITMENT_DECIDE");
  
  if (!canStart) {
    logInfo("recruitment_decide_deduped", { ticketKey, decision, jobKey });
    await interaction.followUp({
      content: "ℹ️ Cette décision a déjà été traitée.",
      ephemeral: true,
    });
    return;
  }
  
  try {
    // Call panel API
    const apiResult = await callDecisionAPI(ticketKey, decision, staffDiscordId, staffTag, messageId, channelId);
    
    if (!apiResult.ok) {
      logWarn("recruitment_decide_api_failed", { ticketKey, decision, error: apiResult.error });
      await interaction.followUp({
        content: `❌ Erreur API: ${apiResult.error}`,
        ephemeral: true,
      });
      await finishJob(jobKey, "failed");
      return;
    }
    
    const { recruitment, staff } = apiResult.data;
    
    // Update message embed and disable buttons
    if (interaction.message) {
      const decisionEmbed = buildDecisionEmbed({
        ticketKey,
        decision,
        candidateName: recruitment.rpName || recruitment.discordId || "Unknown",
        steamId: recruitment.steamId,
        staffTag,
        staffRpName: staff.rpName,
      });
      
      // Disable all buttons
      const disabledRows: ActionRowBuilder<ButtonBuilder>[] = [];
      if (interaction.message.components) {
        for (const row of interaction.message.components) {
          const buttonRow = new ActionRowBuilder<ButtonBuilder>();
          for (const component of (row as any).components) {
            if (component.type === 2) { // Button
              const button = ButtonBuilder.from(component as any);
              button.setDisabled(true);
              buttonRow.addComponents(button);
            }
          }
          if (buttonRow.components.length > 0) {
            disabledRows.push(buttonRow);
          }
        }
      }
      
      try {
        await interaction.editReply({
          embeds: [decisionEmbed],
          components: disabledRows,
        });
      } catch (updateError) {
        logWarn("recruitment_message_update_failed", { ticketKey, error: updateError instanceof Error ? updateError.message : String(updateError) });
        // Fallback to followUp
        await interaction.followUp({
          content: `✅ Décision enregistrée: **${decision}**`,
          ephemeral: true,
        });
      }
    } else {
      await interaction.followUp({
        content: `✅ Décision enregistrée: **${decision}**`,
        ephemeral: true,
      });
    }
    
    // Post to log channel
    if (interaction.guild) {
      await postDecisionLog({
        guild: interaction.guild,
        ticketKey,
        decision,
        candidateName: recruitment.rpName || recruitment.discordId || "Unknown",
        steamId: recruitment.steamId,
        staffTag,
        staffRpName: staff.rpName,
        threadId: recruitment.threadId,
      });
    }
    
    await finishJob(jobKey, "done");
    logInfo("recruitment_decide_success", { ticketKey, decision, staffDiscordId });
    
  } catch (error) {
    logError("recruitment_decide_error", { ticketKey, decision }, error as Error);
    
    try {
      await interaction.reply({
        content: "❌ Une erreur est survenue lors du traitement de la décision.",
        ephemeral: true,
      });
    } catch {
      // Ignore reply errors
    }
    
    await finishJob(jobKey, "failed");
  }
}
