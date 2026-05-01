/**
 * Complaint Decision Handler
 * Handles TRAITE/NON_RESOLU/REFUSE buttons on complaint tickets from Discord
 */

import {
  ButtonInteraction,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  type Guild,
  type TextChannel,
  type ThreadChannel,
} from "discord.js";
import { startJob, finishJob } from "./lib/job-idempotence.js";
import { logInfo, logWarn, logError } from "./lib/worker-obs.js";
import { IDS } from "./ids.js";
import { archiveComplaintThreadMessages } from "./archive-complaint-messages.js";

const PANEL_URL = process.env.INGEST_BASE_URL || "http://localhost:3000";
const LOG_CHANNEL_ID = process.env.COMPLAINT_LOG_CHANNEL_ID || process.env.TICKETS_LOGS_CHANNEL_ID || null;

interface ComplaintDecisionParams {
  ticketKey: string;
  decision: "TRAITE" | "NON_RESOLUE" | "REFUSE";
}

function normalizeComplaintDecision(value: string): ComplaintDecisionParams["decision"] | null {
  const normalized = value.toUpperCase();

  if (normalized === "TRAITE") return "TRAITE";
  if (normalized === "NON_RESOLU" || normalized === "NON_RESOLUE") return "NON_RESOLUE";
  if (normalized === "REFUSE") return "REFUSE";

  return null;
}

async function hasStaffDecisionAccess(interaction: ButtonInteraction): Promise<boolean> {
  const guild = interaction.guild;
  if (!guild) return false;

  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return false;

  const allowedRoleIds = new Set(
    [IDS.CHEF_FAMILLE_ROLE_ID, IDS.SOUS_CHEF_FAMILLE_ROLE_ID, IDS.ETAT_MAJOR_ROLE_ID, IDS.RECRUTEUR_ROLE_ID].filter(
      (roleId): roleId is string => Boolean(roleId)
    )
  );

  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageChannels) ||
    member.roles.cache.some((role) => allowedRoleIds.has(role.id))
  );
}

function mapDecisionErrorToUserMessage(error?: string): string {
  if (!error) return "❌ Impossible de traiter cette décision pour le moment.";
  if (error.includes("Unauthorized")) return "❌ Action réservée au staff.";
  if (error.includes("Invalid decision") || error.includes("Format")) {
    return "❌ Ce bouton n'est plus valide.";
  }
  return "❌ Impossible de traiter cette décision pour le moment.";
}

function parseComplaintCustomId(customId: string): ComplaintDecisionParams | null {
  // Format from tickets.ts: ticket:complaint:close:STATUS:TICKETKEY
  // STATUS can be: TRAITE, NON_RESOLUE, REFUSE (or legacy NON_RESOLU)
  // Alternative format: complaint:decide:STATUS:TICKETKEY
  
  if (customId.startsWith("complaint:decide:")) {
    const parts = customId.split(":");
    if (parts.length < 4) return null;

    const decision = normalizeComplaintDecision(parts[2]);
    const ticketKey = parts.slice(3).join(":");

    if (!decision) return null;
    if (!ticketKey) return null;

    return { ticketKey, decision };
  }
  
  // Legacy format: ticket:complaint:close:STATUS:TICKETKEY
  if (customId.startsWith("ticket:complaint:close:")) {
    const rest = customId.replace("ticket:complaint:close:", "");
    const colonIdx = rest.indexOf(":");
    if (colonIdx === -1) return null;

    const status = normalizeComplaintDecision(rest.slice(0, colonIdx));
    const ticketKey = rest.slice(colonIdx + 1);

    if (!status) return null;
    if (!ticketKey) return null;

    return { ticketKey, decision: status };
  }
  
  return null;
}

/**
 * Call panel API to record decision
 */
async function callDecisionAPI(
  ticketKey: string,
  decision: "TRAITE" | "NON_RESOLUE" | "REFUSE",
  staffDiscordId: string,
  staffUsername: string,
  messageId?: string,
  channelId?: string
): Promise<{ ok: boolean; data?: any; error?: string }> {
  try {
    const ingestSecret = process.env.INGEST_SECRET;
    if (!ingestSecret) {
      logError("complaint_ingest_secret_missing", { ticketKey });
      return { ok: false, error: "INGEST_SECRET not configured" };
    }

    const url = `${PANEL_URL}/api/discord/complaint/decide`;
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
    logError("complaint_api_call_failed", { ticketKey, decision }, error as Error);
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Build decision embed
 */
function buildDecisionEmbed(params: {
  ticketKey: string;
  decision: "TRAITE" | "NON_RESOLUE" | "REFUSE";
  title: string;
  authorDiscordId?: string;
  targetName?: string;
  staffTag: string;
  staffRpName?: string;
}): EmbedBuilder {
  const { ticketKey, decision, title, authorDiscordId, targetName, staffTag, staffRpName } = params;
  
  // Color and emoji based on decision
  let color: number;
  let emoji: string;
  let statusLabel: string;
  
  if (decision === "TRAITE") {
    color = 0x22c55e; // Green
    emoji = "✅";
    statusLabel = "**TRAITÉ**";
  } else if (decision === "NON_RESOLUE") {
    color = 0xf59e0b; // Orange
    emoji = "⚠️";
    statusLabel = "**NON RÉSOLU**";
  } else {
    color = 0xef4444; // Red
    emoji = "❌";
    statusLabel = "**REFUSÉ**";
  }
  
  const embedTitle = `${emoji} Plainte — ${decision === "TRAITE" ? "Traitée" : decision === "NON_RESOLUE" ? "Non Résolue" : "Refusée"}`;
  
  const embed = new EmbedBuilder()
    .setTitle(embedTitle)
    .setColor(color)
    .addFields(
      { name: "📋 Sujet", value: title || "Sans titre", inline: false },
      { name: "🎫 Ticket", value: `\`${ticketKey}\``, inline: true },
      { name: "📊 Statut", value: statusLabel, inline: true }
    )
    .setTimestamp();
  
  if (authorDiscordId) {
    embed.addFields({ name: "👤 Plaignant", value: `<@${authorDiscordId}>`, inline: true });
  }
  
  if (targetName) {
    embed.addFields({ name: "🎯 Cible", value: targetName, inline: true });
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
  decision: "TRAITE" | "NON_RESOLUE" | "REFUSE";
  title: string;
  authorDiscordId?: string;
  targetName?: string;
  staffTag: string;
  staffRpName?: string;
  threadId?: string;
}): Promise<void> {
  if (!LOG_CHANNEL_ID) {
    logWarn("complaint_log_channel_missing", { ticketKey: params.ticketKey });
    return;
  }
  
  try {
    const channel = await params.guild.channels.fetch(LOG_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) {
      logWarn("complaint_log_channel_invalid", { channelId: LOG_CHANNEL_ID });
      return;
    }
    
    const embed = buildDecisionEmbed(params);
    
    let content = `📌 **Plainte ${params.decision === "TRAITE" ? "Traitée" : params.decision === "NON_RESOLUE" ? "Non Résolue" : "Refusée"}**`;
    if (params.threadId) {
      content += ` • Thread: <#${params.threadId}>`;
    }
    
    await (channel as TextChannel).send({ content, embeds: [embed] });
    
    logInfo("complaint_log_posted", { ticketKey: params.ticketKey, channelId: LOG_CHANNEL_ID });
  } catch (error) {
    logError("complaint_log_post_failed", { ticketKey: params.ticketKey }, error as Error);
  }
}

/**
 * Main handler for complaint decision buttons
 */
export async function handleComplaintDecision(
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
    logError("complaint_ack_failed", { customId: interaction.customId }, ackError as Error);
    return;
  }

  if (!(await hasStaffDecisionAccess(interaction))) {
    logWarn("complaint_decide_worker_unauthorized", {
      customId: interaction.customId,
      staffDiscordId,
    });
    await interaction.followUp({
      content: "❌ Action réservée au staff.",
      ephemeral: true,
    });
    return;
  }
  
  // Parse customId
  const params = parseComplaintCustomId(interaction.customId);
  if (!params) {
    logWarn("complaint_invalid_custom_id", { customId: interaction.customId, userId: staffDiscordId });
    await interaction.followUp({
      content: "❌ Ce bouton n'est plus valide.",
      ephemeral: true,
    });
    return;
  }
  
  const { ticketKey, decision } = params;
  
  logInfo("complaint_decide_start", { ticketKey, decision, staffDiscordId, staffTag });
  
  // Idempotence check
  const jobKey = `COMPLAINT_DECIDE:${ticketKey}:${decision}`;
  const canStart = await startJob(jobKey, "COMPLAINT_DECIDE");
  
  if (!canStart) {
    logInfo("complaint_decide_deduped", { ticketKey, decision, jobKey });
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
      logWarn("complaint_decide_api_failed", { ticketKey, decision, error: apiResult.error });
      await interaction.followUp({
        content: mapDecisionErrorToUserMessage(apiResult.error),
        ephemeral: true,
      });
      await finishJob(jobKey, "failed");
      return;
    }
    
    const { complaint, staff } = apiResult.data;
    
    // Update message embed and disable buttons
    if (interaction.message) {
      const decisionEmbed = buildDecisionEmbed({
        ticketKey,
        decision,
        title: complaint.title,
        authorDiscordId: complaint.authorDiscordId,
        targetName: complaint.targetName,
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
              if ((component as any).style === ButtonStyle.Link || Boolean((component as any).url)) {
                continue;
              }
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
        logWarn("complaint_message_update_failed", { ticketKey, error: updateError instanceof Error ? updateError.message : String(updateError) });
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
        title: complaint.title,
        authorDiscordId: complaint.authorDiscordId,
        targetName: complaint.targetName,
        staffTag,
        staffRpName: staff.rpName,
        threadId: complaint.threadId,
      });
    }

    // Archive thread messages to panel
    if (interaction.guild && complaint.threadId) {
      const archiveResult = await archiveComplaintThreadMessages({
        threadId: complaint.threadId,
        ticketKey,
        guild: interaction.guild,
      });
      if (!archiveResult.ok) {
        logWarn("complaint_archive_failed_in_decision", { ticketKey, error: archiveResult.error });
      } else {
        logInfo("complaint_messages_archived", { ticketKey, messageCount: archiveResult.messageCount });
      }
    }

    // Close/archive the thread
    if (complaint.threadId && interaction.guild) {
      try {
        const thread = await interaction.guild.channels.fetch(complaint.threadId);
        if (thread?.isThread()) {
          const threadChannel = thread as ThreadChannel;
          
          // Archive thread
          if (!threadChannel.archived) {
            await threadChannel.setArchived(true);
            logInfo("complaint_thread_archived", { ticketKey, threadId: complaint.threadId });
          }
          
          // Lock thread
          if (!threadChannel.locked) {
            await threadChannel.setLocked(true);
            logInfo("complaint_thread_locked", { ticketKey, threadId: complaint.threadId });
          }
        } else if (thread?.type === ChannelType.GuildText) {
          const textChannel = thread as TextChannel;

          // Send close message before deleting
          await textChannel.send({
            embeds: [
              new EmbedBuilder()
                .setTitle("🔒 Ticket fermé")
                .setDescription(`Plainte clôturée par le staff.`)
                .setColor(0x16a34a)
                .setTimestamp(),
            ],
          }).catch(() => null);

          // Delete the text channel (rename alone leaves it visible)
          await textChannel.delete(`Plainte ${ticketKey} clôturée`).catch((delErr) => {
            logWarn("complaint_text_channel_delete_failed", { ticketKey, channelId: complaint.threadId, error: delErr instanceof Error ? delErr.message : String(delErr) });
          });

          logInfo("complaint_text_channel_deleted", { ticketKey, channelId: complaint.threadId });
        }
      } catch (err) {
        logWarn("complaint_thread_close_failed", { ticketKey, error: err instanceof Error ? err.message : String(err) });
        // Non-critical, don't fail the whole operation
      }
    }

    // Send copy to complainant via DM
    if (complaint.authorDiscordId) {
      try {
        const complainant = await interaction.client.users.fetch(complaint.authorDiscordId);
        if (complainant) {
          const decisionText = decision === "TRAITE" ? "traitée" : decision === "NON_RESOLUE" ? "non résolue" : "refusée";
          const closureText =
            decision === "TRAITE"
              ? "Le staff a traité votre plainte."
              : decision === "NON_RESOLUE"
                ? "Le staff a clôturé votre plainte comme non résolue."
                : "Le staff a refusé votre plainte.";
          const dmEmbed = new EmbedBuilder()
            .setTitle("📋 Résumé de votre plainte")
            .setColor(decision === "TRAITE" ? 0x22c55e : decision === "NON_RESOLUE" ? 0xf59e0b : 0xef4444)
            .setDescription(closureText)
            .addFields(
              { name: "Type", value: "Plainte", inline: true },
              { name: "Statut final", value: decisionText, inline: true },
              { name: "Cible", value: complaint.targetName || "—", inline: false },
              { name: "Raison", value: complaint.reason || complaint.title || "Sans raison", inline: false }
            )
            .setFooter({ text: "Los Esperados • plainte clôturée" })
            .setTimestamp();

          if (complaint.summary) {
            dmEmbed.addFields({ name: "Résumé", value: complaint.summary, inline: false });
          }

          await complainant.send({ embeds: [dmEmbed] });
          logInfo("complaint_dm_sent", { ticketKey, authorDiscordId: complaint.authorDiscordId });
        }
      } catch (err) {
        logWarn("complaint_dm_send_failed", { ticketKey, authorDiscordId: complaint.authorDiscordId, error: err instanceof Error ? err.message : String(err) });
        // Non-critical, don't fail the whole operation
      }
    }
    
    await finishJob(jobKey, "done");
    logInfo("complaint_decide_success", { ticketKey, decision, staffDiscordId });
    
  } catch (error) {
    logError("complaint_decide_error", { ticketKey, decision }, error as Error);
    
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
