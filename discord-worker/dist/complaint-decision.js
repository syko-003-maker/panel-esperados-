/**
 * Complaint Decision Handler
 * Handles TRAITE/NON_RESOLU/REFUSE buttons on complaint tickets from Discord
 */
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, } from "discord.js";
import { startJob, finishJob } from "./lib/job-idempotence.js";
import { logInfo, logWarn, logError } from "./lib/worker-obs.js";
const PANEL_URL = process.env.INGEST_BASE_URL || "http://localhost:3000";
const LOG_CHANNEL_ID = process.env.COMPLAINT_LOG_CHANNEL_ID || process.env.TICKETS_LOGS_CHANNEL_ID || null;
function parseComplaintCustomId(customId) {
    // Format from tickets.ts: ticket:complaint:close:STATUS:TICKETKEY
    // STATUS can be: TRAITE, NON_RESOLU, REFUSE (or other legacy values)
    // Alternative format: complaint:decide:STATUS:TICKETKEY
    if (customId.startsWith("complaint:decide:")) {
        const parts = customId.split(":");
        if (parts.length < 4)
            return null;
        const decision = parts[2].toUpperCase();
        const ticketKey = parts.slice(3).join(":");
        if (!["TRAITE", "NON_RESOLU", "REFUSE"].includes(decision))
            return null;
        if (!ticketKey)
            return null;
        return { ticketKey, decision: decision };
    }
    // Legacy format: ticket:complaint:close:STATUS:TICKETKEY
    if (customId.startsWith("ticket:complaint:close:")) {
        const rest = customId.replace("ticket:complaint:close:", "");
        const colonIdx = rest.indexOf(":");
        if (colonIdx === -1)
            return null;
        const status = rest.slice(0, colonIdx).toUpperCase();
        const ticketKey = rest.slice(colonIdx + 1);
        if (!["TRAITE", "NON_RESOLU", "REFUSE"].includes(status))
            return null;
        if (!ticketKey)
            return null;
        return { ticketKey, decision: status };
    }
    return null;
}
/**
 * Call panel API to record decision
 */
async function callDecisionAPI(ticketKey, decision, staffDiscordId, staffUsername, messageId, channelId) {
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
    }
    catch (error) {
        logError("complaint_api_call_failed", { ticketKey, decision }, error);
        return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
}
/**
 * Build decision embed
 */
function buildDecisionEmbed(params) {
    const { ticketKey, decision, title, authorDiscordId, targetName, staffTag, staffRpName } = params;
    // Color and emoji based on decision
    let color;
    let emoji;
    let statusLabel;
    if (decision === "TRAITE") {
        color = 0x22c55e; // Green
        emoji = "✅";
        statusLabel = "**TRAITÉ**";
    }
    else if (decision === "NON_RESOLU") {
        color = 0xf59e0b; // Orange
        emoji = "⚠️";
        statusLabel = "**NON RÉSOLU**";
    }
    else {
        color = 0xef4444; // Red
        emoji = "❌";
        statusLabel = "**REFUSÉ**";
    }
    const embedTitle = `${emoji} Plainte — ${decision === "TRAITE" ? "Traitée" : decision === "NON_RESOLU" ? "Non Résolue" : "Refusée"}`;
    const embed = new EmbedBuilder()
        .setTitle(embedTitle)
        .setColor(color)
        .addFields({ name: "📋 Sujet", value: title || "Sans titre", inline: false }, { name: "🎫 Ticket", value: `\`${ticketKey}\``, inline: true }, { name: "📊 Statut", value: statusLabel, inline: true })
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
async function postDecisionLog(params) {
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
        let content = `📌 **Plainte ${params.decision === "TRAITE" ? "Traitée" : params.decision === "NON_RESOLU" ? "Non Résolue" : "Refusée"}**`;
        if (params.threadId) {
            content += ` • Thread: <#${params.threadId}>`;
        }
        await channel.send({ content, embeds: [embed] });
        logInfo("complaint_log_posted", { ticketKey: params.ticketKey, channelId: LOG_CHANNEL_ID });
    }
    catch (error) {
        logError("complaint_log_post_failed", { ticketKey: params.ticketKey }, error);
    }
}
/**
 * Main handler for complaint decision buttons
 */
export async function handleComplaintDecision(interaction) {
    const staffDiscordId = interaction.user.id;
    const staffTag = interaction.user.tag;
    const messageId = interaction.message?.id;
    const channelId = interaction.channelId;
    // ✅ IMMEDIATE ACK - deferUpdate to prevent Discord timeout
    try {
        await interaction.deferUpdate();
    }
    catch (ackError) {
        logError("complaint_ack_failed", { customId: interaction.customId }, ackError);
        return;
    }
    // Parse customId
    const params = parseComplaintCustomId(interaction.customId);
    if (!params) {
        logWarn("complaint_invalid_custom_id", { customId: interaction.customId, userId: staffDiscordId });
        await interaction.followUp({
            content: "❌ Format de bouton invalide.",
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
                content: `❌ Erreur API: ${apiResult.error}`,
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
            const disabledRows = [];
            if (interaction.message.components) {
                for (const row of interaction.message.components) {
                    const buttonRow = new ActionRowBuilder();
                    for (const component of row.components) {
                        if (component.type === 2) { // Button
                            const button = ButtonBuilder.from(component);
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
            }
            catch (updateError) {
                logWarn("complaint_message_update_failed", { ticketKey, error: updateError instanceof Error ? updateError.message : String(updateError) });
                // Fallback to followUp
                await interaction.followUp({
                    content: `✅ Décision enregistrée: **${decision}**`,
                    ephemeral: true,
                });
            }
        }
        else {
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
        await finishJob(jobKey, "done");
        logInfo("complaint_decide_success", { ticketKey, decision, staffDiscordId });
    }
    catch (error) {
        logError("complaint_decide_error", { ticketKey, decision }, error);
        try {
            await interaction.reply({
                content: "❌ Une erreur est survenue lors du traitement de la décision.",
                ephemeral: true,
            });
        }
        catch {
            // Ignore reply errors
        }
        await finishJob(jobKey, "failed");
    }
}
