/**
 * Panel Link Management System
 * Discord integration for linking members via /link command
 */
import { SlashCommandBuilder, ButtonBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, ButtonStyle, MessageFlags, PermissionFlagsBits, } from "discord.js";
import { IDS } from "./ids.js";
import { buildLinkPanelEmbed } from "./link-embed.js";
class LinkConflictError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
// ─────────────────────────────────────────────────────────────
// Config (Lazy Loading)
// ─────────────────────────────────────────────────────────────
// ✅ Lazy getters - called at runtime to allow env loading before module import
function getIngestBaseUrl() {
    const url = process.env.INGEST_BASE_URL;
    if (!url) {
        throw new Error("INGEST_BASE_URL is required. Set it to https://losesperados.xyz in production.");
    }
    return url.replace(/\/+$/, ""); // Remove trailing slashes
}
function getWorkerSecret() {
    const secret = process.env.INGEST_SECRET ?? process.env.DISCORD_WORKER_SECRET;
    if (!secret) {
        throw new Error("INGEST_SECRET or DISCORD_WORKER_SECRET is required.");
    }
    return secret;
}
// Cached lazy values (initialized on first use)
let cachedIngestBaseUrl = null;
let cachedWorkerSecret = null;
// ✅ Get config with caching - called at runtime by handlers
function getConfig() {
    if (!cachedIngestBaseUrl) {
        cachedIngestBaseUrl = getIngestBaseUrl();
    }
    if (!cachedWorkerSecret) {
        cachedWorkerSecret = getWorkerSecret();
    }
    return { ingestBaseUrl: cachedIngestBaseUrl, workerSecret: cachedWorkerSecret };
}
// ✅ Safe getters for backward compatibility (call getConfig() at runtime)
function getINGEST_BASE_URL() {
    return getConfig().ingestBaseUrl;
}
function getWORKER_SECRET() {
    return getConfig().workerSecret;
}
// For module initialization without throwing
const INGEST_BASE_URL = ""; // Will be populated at runtime
const PANEL_BASE_URL = ""; // Will be populated at runtime
const WORKER_SECRET = ""; // Will be populated at runtime
// Custom IDs for buttons and modals
export const LINK_CUSTOM_IDS = {
    LINK_BUTTON: "link:req:modify",
    DELETE_BUTTON: "link:req:delete",
    CANCEL_BUTTON: "link:req:cancel",
    CONFIRM_DELETE_BUTTON: "link:req:confirm_delete",
    LINK_MODAL: "link:modal:submit",
    STEAM_ID_INPUT: "link:input:steamid",
    RP_NAME_INPUT: "link:input:rpname",
};
// ─────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────
function log(event, data = {}) {
    console.log(JSON.stringify({
        event,
        ...data,
        timestamp: new Date().toISOString(),
    }));
}
// ─────────────────────────────────────────────────────────────
// Panel API Client
// ─────────────────────────────────────────────────────────────
async function panelFetch(path, options = {}) {
    // ✅ Get config at runtime (after env is loaded)
    const { ingestBaseUrl, workerSecret } = getConfig();
    const url = `${ingestBaseUrl}${path}`;
    const method = options.method || "GET";
    try {
        // ✅ Log request details BEFORE fetch
        const hasIngestSecret = !!workerSecret;
        log("link_request", {
            method,
            url,
            hasIngestSecret,
            secretLength: workerSecret ? workerSecret.length : 0,
        });
        const res = await fetch(url, {
            ...options,
            headers: {
                ...options.headers,
                "x-ingest-secret": workerSecret,
                "Content-Type": "application/json",
            },
            signal: AbortSignal.timeout(10000),
        });
        const contentType = res.headers.get("content-type") || "";
        // ✅ Log response details AFTER fetch
        log("link_response", {
            method,
            url,
            status: res.status,
            contentType,
            isJSON: contentType.includes("application/json"),
        });
        if (!res.ok) {
            let errorText = "";
            try {
                if (contentType.includes("application/json")) {
                    const json = await res.json();
                    errorText = json.error || json.message || JSON.stringify(json).slice(0, 200);
                }
                else {
                    // ✅ Always read body for non-JSON errors (HTML login, etc.)
                    errorText = await res.text();
                    // Show preview of HTML responses
                    if (errorText.includes("<")) {
                        const preview = errorText.slice(0, 120);
                        log("panel_api_html_error", {
                            method,
                            path,
                            status: res.status,
                            contentType,
                            bodyPreview: preview,
                            bodyLength: errorText.length,
                        });
                        errorText = `HTML response (${errorText.length} bytes): ${preview}...`;
                    }
                }
            }
            catch (e) {
                errorText = `(Status: ${res.status}, ${contentType || "unknown content-type"})`;
            }
            log("panel_api_error", {
                method,
                path,
                status: res.status,
                contentType,
                message: errorText.slice(0, 200),
            });
            return null;
        }
        // ✅ SECURITY: Verify response is JSON before parsing
        if (!contentType.includes("application/json")) {
            const textPreview = await res.text().catch(() => "(unable to read)");
            log("panel_fetch_non_json_success", {
                method,
                path,
                status: res.status,
                error: `Invalid content-type: expected application/json, got ${contentType}`,
                url,
                bodyPreview: textPreview.slice(0, 120),
            });
            return null;
        }
        // ✅ Parse JSON only after content-type verification
        return res.json().catch((err) => {
            log("panel_fetch_json_parse_error", {
                method,
                path,
                error: `Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}`,
                url,
            });
            return null;
        });
    }
    catch (e) {
        log("panel_fetch_network_error", {
            method,
            path,
            error: e instanceof Error ? e.message : String(e),
            url,
        });
        return null;
    }
}
// Get member link data
async function getMemberLinkData(discordId) {
    const data = await panelFetch(`/api/staff/link/${discordId}`);
    if (!data || !("discordId" in data))
        return null;
    return data;
}
// Create or update member link
async function updateMemberLink(discordId, steamId, rpName) {
    // ✅ FORCE: Use discordId in URL path AND body for explicit routing
    const data = await panelFetch(`/api/staff/link/${discordId}`, {
        method: "POST",
        body: JSON.stringify({
            discordId, // Also in body for backwards compatibility
            steamId,
            rpName,
        }),
    });
    if (!data) {
        log("updateMemberLink_failed", {
            discordId,
            reason: "panelFetch returned null",
        });
        return null;
    }
    if ("ok" in data && data.ok === false) {
        const errorValue = data.error;
        const errorCode = typeof errorValue === "string"
            ? errorValue
            : errorValue?.code ?? "API_ERROR";
        const message = typeof errorValue === "string"
            ? errorValue
            : errorValue?.message ?? "Erreur API";
        return {
            ok: false,
            errorCode,
            message,
        };
    }
    // ✅ Accept both formats:
    // - Format 1 (nested): { ok: true, member: { id, discordId, ... } }
    // - Format 2 (flat): { ok: true, id/memberId, discordId, ... }
    let memberData;
    if ("member" in data && data.member) {
        // Format 1: nested member object
        memberData = data.member;
    }
    else if ("memberId" in data || "id" in data) {
        // Format 2: flat response
        memberData = data;
    }
    else {
        log("updateMemberLink_invalid_response", {
            discordId,
            receivedKeys: Object.keys(data),
        });
        return null;
    }
    // Normalize response to PanelLinkResponse format
    return {
        ok: true,
        memberId: memberData.memberId || memberData.id,
        discordId: memberData.discordId,
        steamId: memberData.steamId,
        rpName: memberData.rpName ?? null,
        mode: memberData.mode,
    };
}
// Delete member link
async function deleteMemberLink(discordId) {
    const data = await panelFetch(`/api/staff/link/${discordId}`, {
        method: "DELETE",
    });
    return Boolean(data);
}
// ─────────────────────────────────────────────────────────────
// Role Verification
// ─────────────────────────────────────────────────────────────
async function hasChefRole(interaction) {
    if (!interaction.guild)
        return false;
    try {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        // Check if member has Chef Famille or État-Major role
        const roleIds = [IDS.CHEF_FAMILLE_ROLE_ID, IDS.ETAT_MAJOR_ROLE_ID].filter((id) => typeof id === "string" && /^[0-9]{17,20}$/.test(id));
        if (roleIds.length > 0) {
            return roleIds.some((id) => member.roles.cache.has(id));
        }
        // If no role configured, allow admins
        return member.permissions.has(PermissionFlagsBits.ManageRoles);
    }
    catch {
        return false;
    }
}
// ─────────────────────────────────────────────────────────────
// Date Formatting
// ─────────────────────────────────────────────────────────────
// Legacy function for backward compatibility
function createLinkPanelEmbed(targetUser, linkData) {
    return buildLinkPanelEmbed({
        user: { id: targetUser, displayAvatarURL: () => "" },
        discordId: linkData?.discordId ?? null,
        steamId: linkData?.steamId || null,
        rpName: linkData?.rpName || null,
    });
}
function createSuccessEmbed(title, description) {
    return new EmbedBuilder()
        .setTitle(`✅ ${title}`)
        .setDescription(description)
        .setColor(0x00ff00)
        .setTimestamp();
}
function createErrorEmbed(title, error) {
    return new EmbedBuilder()
        .setTitle(`❌ ${title}`)
        .setDescription(error)
        .setColor(0xff0000)
        .setTimestamp();
}
function createDeletedEmbed(discordId) {
    return new EmbedBuilder()
        .setTitle("🗑️ Liaison Supprimée")
        .setDescription(`La liaison de <@${discordId}> a été supprimée.`)
        .setColor(0xff0000)
        .setTimestamp();
}
function createConfirmationEmbed(title, description, color) {
    return new EmbedBuilder()
        .setTitle(`⚠️ ${title}`)
        .setDescription(description)
        .setColor(color)
        .setTimestamp();
}
function createCancelledEmbed() {
    return new EmbedBuilder()
        .setTitle("❌ Action Annulée")
        .setDescription("L'opération a été annulée.")
        .setColor(0x808080)
        .setTimestamp();
}
// ─────────────────────────────────────────────────────────────
// Modal Creation
// ─────────────────────────────────────────────────────────────
function createLinkModal(discordId, currentData) {
    const modal = new ModalBuilder()
        .setCustomId(`${LINK_CUSTOM_IDS.LINK_MODAL}:${discordId}`)
        .setTitle("Lier un Membre");
    // SteamID64 input
    const steamIdInput = new TextInputBuilder()
        .setCustomId(LINK_CUSTOM_IDS.STEAM_ID_INPUT)
        .setLabel("SteamID64")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder("76561198012345678")
        .setValue(currentData?.steamId || "");
    // Nom RP input
    const rpNameInput = new TextInputBuilder()
        .setCustomId(LINK_CUSTOM_IDS.RP_NAME_INPUT)
        .setLabel("Nom RP")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder("Jean Dupont")
        .setMaxLength(50)
        .setValue(currentData?.rpName || "");
    modal.addComponents(new ActionRowBuilder().addComponents(steamIdInput), new ActionRowBuilder().addComponents(rpNameInput));
    return modal;
}
// ─────────────────────────────────────────────────────────────
// Slash Command Definition
// ─────────────────────────────────────────────────────────────
export function createLinkCommand() {
    return new SlashCommandBuilder()
        .setName("link")
        .setDescription("Lier un membre au panel (Chef/État-Major seulement)")
        .addUserOption((opt) => opt
        .setName("user")
        .setDescription("Le membre Discord à lier")
        .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false);
}
// ─────────────────────────────────────────────────────────────
// Command Handler
// ─────────────────────────────────────────────────────────────
export async function handleLinkCommand(interaction) {
    const targetUser = interaction.options.getUser("user", true);
    log("link_command_start", {
        userId: interaction.user.id,
        targetId: targetUser.id,
        guildId: interaction.guildId,
    });
    // Verify chef role
    const isChef = await hasChefRole(interaction);
    if (!isChef) {
        await interaction.reply({
            embeds: [
                createErrorEmbed("Accès Refusé", "Seuls les Chef Famille ou État-Major peuvent utiliser cette commande."),
            ],
            flags: MessageFlags.Ephemeral,
        });
        log("link_command_denied", {
            userId: interaction.user.id,
            reason: "Not chef role",
        });
        return;
    }
    // Prevent self-linking
    if (interaction.user.id === targetUser.id) {
        await interaction.reply({
            embeds: [
                createErrorEmbed("Auto-Liaison Interdite", "Vous ne pouvez pas vous lier vous-même."),
            ],
            flags: MessageFlags.Ephemeral,
        });
        log("link_command_denied", {
            userId: interaction.user.id,
            reason: "Self link attempt",
        });
        return;
    }
    await interaction.deferReply({ ephemeral: false });
    try {
        // Fetch current link data
        const currentData = await getMemberLinkData(targetUser.id);
        // Create embed with enhanced styling
        const embed = buildLinkPanelEmbed({
            user: targetUser,
            discordId: currentData?.discordId ?? null,
            steamId: currentData?.steamId || null,
            rpName: currentData?.rpName || null,
            sourceLabel: "Discord Worker",
        });
        const linkButton = new ButtonBuilder()
            .setCustomId(`${LINK_CUSTOM_IDS.LINK_BUTTON}:${targetUser.id}`)
            .setLabel("🔗 Lier / Modifier")
            .setStyle(ButtonStyle.Primary);
        const deleteButton = new ButtonBuilder()
            .setCustomId(`${LINK_CUSTOM_IDS.DELETE_BUTTON}:${targetUser.id}`)
            .setLabel("🗑️ Supprimer")
            .setStyle(ButtonStyle.Danger);
        const cancelButton = new ButtonBuilder()
            .setCustomId(`${LINK_CUSTOM_IDS.CANCEL_BUTTON}:${targetUser.id}`)
            .setLabel("❌ Annuler")
            .setStyle(ButtonStyle.Secondary);
        const row = new ActionRowBuilder().addComponents(linkButton, deleteButton, cancelButton);
        await interaction.editReply({
            embeds: [embed],
            components: [row],
        });
        log("link_command_ok", {
            userId: interaction.user.id,
            targetId: targetUser.id,
            hasLink: currentData !== null,
        });
    }
    catch (e) {
        log("link_command_error", {
            userId: interaction.user.id,
            targetId: targetUser.id,
            error: e instanceof Error ? e.message : String(e),
        });
        await interaction.editReply({
            embeds: [
                createErrorEmbed("Erreur", `Une erreur s'est produite: ${e instanceof Error ? e.message : "Erreur inconnue"}`),
            ],
        });
    }
}
// ─────────────────────────────────────────────────────────────
// Button Interaction Handlers
// ─────────────────────────────────────────────────────────────
function parseLinkCustomId(customId) {
    const parts = customId.split(":");
    if (parts.length < 4)
        return null;
    // New format: link:req:<action>:<targetId>
    if (parts[0] === "link" && parts[1] === "req") {
        const action = parts[2];
        const targetId = parts.slice(3).join(":");
        if (!action || !targetId)
            return null;
        return { action, targetId };
    }
    // Legacy format: link:action:<action>:<targetId> OR link:confirm:<action>:<targetId>
    if (parts[0] === "link" && (parts[1] === "action" || parts[1] === "confirm")) {
        const action = parts[2];
        const targetId = parts.slice(3).join(":");
        if (!action || !targetId)
            return null;
        return { action, targetId };
    }
    return null;
}
export async function handleLinkButtonInteraction(interaction, client) {
    const startedAt = Date.now();
    const parsed = parseLinkCustomId(interaction.customId);
    if (!parsed) {
        await interaction.reply({
            embeds: [createErrorEmbed("Erreur", "Bouton invalide.")],
            flags: MessageFlags.Ephemeral,
        });
        log("link_button_invalid", {
            customId: interaction.customId,
            userId: interaction.user.id,
            channelId: interaction.channelId,
            durationMs: Date.now() - startedAt,
        });
        return;
    }
    const { action, targetId } = parsed;
    log("link_button_click", {
        button: interaction.customId,
        userId: interaction.user.id,
        targetId,
        channelId: interaction.channelId,
    });
    // Verify chef role
    const isChef = await hasChefRole(interaction);
    if (!isChef) {
        await interaction.reply({
            embeds: [
                createErrorEmbed("Accès Refusé", "Vous n'avez pas les permissions pour cette action."),
            ],
            flags: MessageFlags.Ephemeral,
        });
        log("link_button_denied", {
            customId: interaction.customId,
            userId: interaction.user.id,
            channelId: interaction.channelId,
            durationMs: Date.now() - startedAt,
        });
        return;
    }
    const isCancel = interaction.customId.startsWith(LINK_CUSTOM_IDS.CANCEL_BUTTON) ||
        interaction.customId.startsWith("link:action:cancel");
    const isModify = interaction.customId.startsWith(LINK_CUSTOM_IDS.LINK_BUTTON) ||
        interaction.customId.startsWith("link:action:modify");
    const isDelete = interaction.customId.startsWith(LINK_CUSTOM_IDS.DELETE_BUTTON) ||
        interaction.customId.startsWith("link:action:delete");
    const isConfirmDelete = interaction.customId.startsWith(LINK_CUSTOM_IDS.CONFIRM_DELETE_BUTTON) ||
        interaction.customId.startsWith("link:confirm:delete");
    // Handle cancel button - disable all buttons
    if (isCancel) {
        try {
            // Update original message to remove buttons
            if (interaction.message) {
                await interaction.message.edit({
                    components: [],
                });
            }
            await interaction.reply({
                embeds: [createCancelledEmbed()],
                flags: MessageFlags.Ephemeral,
            });
            log("link_cancelled", {
                userId: interaction.user.id,
                targetId,
                customId: interaction.customId,
                channelId: interaction.channelId,
                durationMs: Date.now() - startedAt,
            });
        }
        catch (e) {
            console.error("[linkreq error]", e instanceof Error ? e.message : String(e), e instanceof Error ? e.stack : "");
            log("link_cancel_error", {
                error: e instanceof Error ? e.message : String(e),
                customId: interaction.customId,
                userId: interaction.user.id,
                channelId: interaction.channelId,
                durationMs: Date.now() - startedAt,
                stack: e instanceof Error ? e.stack : undefined,
            });
            try {
                const safeMessage = e instanceof Error ? e.message.substring(0, 100) : "Erreur inconnue";
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: `❌ Erreur: ${safeMessage}`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }
            catch {
                // ignore
            }
        }
        return;
    }
    // Handle link/modify button - show modal directly (NO defer before showModal!)
    if (isModify) {
        try {
            const currentData = await getMemberLinkData(targetId);
            const modal = createLinkModal(targetId, currentData);
            // ✅ Open modal directly without any defer/reply
            await interaction.showModal(modal);
            log("link_modal_shown", {
                userId: interaction.user.id,
                targetId,
                hasExistingData: !!currentData,
                customId: interaction.customId,
                channelId: interaction.channelId,
                durationMs: Date.now() - startedAt,
            });
        }
        catch (e) {
            console.error("[linkreq error]", e instanceof Error ? e.message : String(e), e instanceof Error ? e.stack : "");
            log("link_button_error", {
                button: "modify",
                error: e instanceof Error ? e.message : String(e),
                customId: interaction.customId,
                userId: interaction.user.id,
                channelId: interaction.channelId,
                durationMs: Date.now() - startedAt,
                stack: e instanceof Error ? e.stack : undefined,
            });
            try {
                const safeMessage = e instanceof Error ? e.message.substring(0, 100) : "Erreur inconnue";
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: `❌ Erreur: ${safeMessage}`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }
            catch {
                // ignore
            }
        }
        return;
    }
    // Handle delete button - show delete confirmation
    else if (isDelete) {
        try {
            const confirmEmbed = createConfirmationEmbed("Confirmer la suppression", `Êtes-vous sûr de vouloir supprimer la liaison de <@${targetId}>?\n\nCette action est irréversible.`, 0xff0000);
            const confirmButton = new ButtonBuilder()
                .setCustomId(`${LINK_CUSTOM_IDS.CONFIRM_DELETE_BUTTON}:${targetId}`)
                .setLabel("🗑️ Confirmer la suppression")
                .setStyle(ButtonStyle.Danger);
            const cancelButton = new ButtonBuilder()
                .setCustomId(`${LINK_CUSTOM_IDS.CANCEL_BUTTON}:${targetId}`)
                .setLabel("❌ Annuler")
                .setStyle(ButtonStyle.Secondary);
            const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);
            await interaction.reply({
                embeds: [confirmEmbed],
                components: [row],
                flags: MessageFlags.Ephemeral,
            });
            log("delete_confirmation_shown", {
                userId: interaction.user.id,
                targetId,
                customId: interaction.customId,
                channelId: interaction.channelId,
                durationMs: Date.now() - startedAt,
            });
        }
        catch (e) {
            console.error("[linkreq error]", e instanceof Error ? e.message : String(e), e instanceof Error ? e.stack : "");
            log("delete_button_error", {
                error: e instanceof Error ? e.message : String(e),
                customId: interaction.customId,
                userId: interaction.user.id,
                channelId: interaction.channelId,
                durationMs: Date.now() - startedAt,
                stack: e instanceof Error ? e.stack : undefined,
            });
            try {
                const safeMessage = e instanceof Error ? e.message.substring(0, 100) : "Erreur inconnue";
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: `❌ Erreur: ${safeMessage}`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }
            catch {
                // ignore
            }
        }
    }
    // Handle confirm delete button - execute delete
    else if (isConfirmDelete) {
        try {
            const success = await deleteMemberLink(targetId);
            if (success) {
                await interaction.reply({
                    embeds: [createDeletedEmbed(targetId)],
                    flags: MessageFlags.Ephemeral,
                });
                // Also update the original confirmation message to remove buttons
                if (interaction.message) {
                    await interaction.message.edit({
                        components: [],
                    });
                }
                log("link_delete_ok", {
                    userId: interaction.user.id,
                    targetId,
                    customId: interaction.customId,
                    channelId: interaction.channelId,
                    durationMs: Date.now() - startedAt,
                });
                // Log to staff channel
                await logToChannel(client, `🗑️ **Liaison Supprimée** - <@${interaction.user.id}> a supprimé la liaison de <@${targetId}>`);
            }
            else {
                await interaction.reply({
                    embeds: [
                        createErrorEmbed("Erreur", "Impossible de supprimer la liaison (utilisateur non lié?)."),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
                log("link_delete_failed", {
                    userId: interaction.user.id,
                    targetId,
                    reason: "API returned null",
                    customId: interaction.customId,
                    channelId: interaction.channelId,
                    durationMs: Date.now() - startedAt,
                });
            }
        }
        catch (e) {
            console.error("[linkreq error]", e instanceof Error ? e.message : String(e), e instanceof Error ? e.stack : "");
            log("link_delete_error", {
                userId: interaction.user.id,
                targetId,
                error: e instanceof Error ? e.message : String(e),
                customId: interaction.customId,
                channelId: interaction.channelId,
                durationMs: Date.now() - startedAt,
                stack: e instanceof Error ? e.stack : undefined,
            });
            try {
                const safeMessage = e instanceof Error ? e.message.substring(0, 100) : "Erreur inconnue";
                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: `❌ Erreur: ${safeMessage}`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }
            catch {
                // ignore
            }
        }
    }
}
// ─────────────────────────────────────────────────────────────
// Modal Submission Handler
// ─────────────────────────────────────────────────────────────
export async function handleLinkModalSubmission(interaction, client) {
    const [, , , targetId] = interaction.customId.split(":");
    log("link_modal_submit", {
        userId: interaction.user.id,
        targetId,
    });
    // Verify chef role
    const isChef = await hasChefRole(interaction);
    if (!isChef) {
        await interaction.reply({
            embeds: [
                createErrorEmbed("Accès Refusé", "Vous n'avez pas les permissions pour cette action."),
            ],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
        // Get form values
        const steamIdRaw = interaction.fields.getTextInputValue(LINK_CUSTOM_IDS.STEAM_ID_INPUT);
        const rpNameRaw = interaction.fields.getTextInputValue(LINK_CUSTOM_IDS.RP_NAME_INPUT);
        const steamId = steamIdRaw?.trim() || null;
        const rpName = rpNameRaw?.trim() || null;
        log("link_bind_start", {
            userId: interaction.user.id,
            targetId,
            steamId,
            rpName,
        });
        // Validate SteamID64 (should be numeric, ~17 digits)
        if (!steamId || !/^\d{17}$/.test(steamId)) {
            await interaction.editReply({
                embeds: [
                    createErrorEmbed("SteamID64 Invalide", "Le SteamID64 doit être un nombre à 17 chiffres."),
                ],
            });
            log("link_submit_validation_error", {
                targetId,
                reason: "Invalid steamid format",
            });
            return;
        }
        // Validate RP name (optional, reasonable length)
        if (rpName && rpName.length > 50) {
            await interaction.editReply({
                embeds: [
                    createErrorEmbed("Nom RP Invalide", "Le nom RP doit être entre 1 et 50 caractères."),
                ],
            });
            log("link_submit_validation_error", {
                targetId,
                reason: "Invalid rpname length",
            });
            return;
        }
        // Call panel API to create/update link
        const result = await updateMemberLink(targetId, steamId, rpName);
        if (!result) {
            await interaction.editReply({
                embeds: [
                    createErrorEmbed("Erreur API", "Impossible de créer/modifier la liaison. Vérifiez les données."),
                ],
            });
            log("link_submit_api_error", {
                targetId,
                reason: "API returned null",
            });
            return;
        }
        if (!result.ok) {
            if (result.errorCode === "STEAM_ALREADY_LINKED") {
                throw new LinkConflictError(result.errorCode, "Ce SteamID est déjà lié à un autre Discord.");
            }
            throw new Error(result.message || "Erreur API");
        }
        const targetUser = await client.users.fetch(targetId).catch(() => null);
        const panelEmbed = buildLinkPanelEmbed({
            user: targetUser ?? interaction.user,
            discordId: targetId,
            steamId: result.steamId,
            rpName: result.rpName,
            sourceLabel: "Discord Worker",
        });
        if (interaction.message) {
            await interaction.message.edit({
                embeds: [panelEmbed],
                components: interaction.message.components ?? [],
            });
        }
        // Success
        await interaction.editReply({
            embeds: [
                createSuccessEmbed("Liaison Enregistrée", `✅ <@${targetId}> est maintenant lié avec le SteamID \`${steamId}\` et le nom RP **${rpName ?? "Non défini"}**.`),
            ],
        });
        log("link_submit_ok", {
            userId: interaction.user.id,
            targetId,
            steamId,
            rpName,
            memberId: result.memberId,
            mode: result.mode,
        });
        // Log to staff channel
        await logToChannel(client, `🔗 **Liaison Créée** - <@${interaction.user.id}> a lié <@${targetId}> (Steam: \`${steamId}\`, RP: **${rpName}**)`);
    }
    catch (e) {
        if (e instanceof LinkConflictError) {
            await interaction.editReply({
                embeds: [createErrorEmbed("Conflit de Liaison", e.message)],
            });
            log("link_bind_fail", {
                userId: interaction.user.id,
                targetId,
                errorCode: e.code,
                error: e.message,
            });
            return;
        }
        log("link_submit_error", {
            userId: interaction.user.id,
            targetId,
            error: e instanceof Error ? e.message : String(e),
        });
        await interaction.editReply({
            embeds: [
                createErrorEmbed("Erreur", `Une erreur s'est produite: ${e instanceof Error ? e.message : "Erreur inconnue"}`),
            ],
        });
    }
}
// ─────────────────────────────────────────────────────────────
// Unlink Command Definition
// ─────────────────────────────────────────────────────────────
export function createUnlinkCommand() {
    return new SlashCommandBuilder()
        .setName("unlink")
        .setDescription("Retirer la liaison d'un membre (Chef/État-Major seulement)")
        .addUserOption((opt) => opt
        .setName("user")
        .setDescription("Le membre Discord à délier")
        .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .setDMPermission(false);
}
// ─────────────────────────────────────────────────────────────
// Unlink Command Handler
// ─────────────────────────────────────────────────────────────
export async function handleUnlinkCommand(interaction) {
    const targetUser = interaction.options.getUser("user", true);
    log("unlink_command_start", {
        userId: interaction.user.id,
        targetId: targetUser.id,
        guildId: interaction.guildId,
    });
    // Verify chef role
    const isChef = await hasChefRole(interaction);
    if (!isChef) {
        await interaction.reply({
            embeds: [
                createErrorEmbed("Accès Refusé", "Seuls les Chef Famille ou État-Major peuvent utiliser cette commande."),
            ],
            flags: MessageFlags.Ephemeral,
        });
        log("unlink_command_denied", {
            userId: interaction.user.id,
            reason: "Not chef role",
        });
        return;
    }
    // Prevent self-unlinking
    if (interaction.user.id === targetUser.id) {
        await interaction.reply({
            embeds: [
                createErrorEmbed("Auto-Suppression Interdite", "Vous ne pouvez pas retirer votre propre liaison."),
            ],
            flags: MessageFlags.Ephemeral,
        });
        log("unlink_command_denied", {
            userId: interaction.user.id,
            reason: "Self unlink attempt",
        });
        return;
    }
    try {
        // Show confirmation embed with delete button
        const confirmEmbed = createConfirmationEmbed("Confirmer la suppression de la liaison", `Êtes-vous sûr de vouloir supprimer la liaison de <@${targetUser.id}>?\n\nCette action est irréversible.`, 0xff0000);
        const confirmButton = new ButtonBuilder()
            .setCustomId(`unlink:confirm:${targetUser.id}`)
            .setLabel("🗑️ Confirmer la suppression")
            .setStyle(ButtonStyle.Danger);
        const cancelButton = new ButtonBuilder()
            .setCustomId(`unlink:cancel:${targetUser.id}`)
            .setLabel("❌ Annuler")
            .setStyle(ButtonStyle.Secondary);
        const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);
        await interaction.reply({
            embeds: [confirmEmbed],
            components: [row],
            flags: MessageFlags.Ephemeral,
        });
        log("unlink_confirmation_shown", {
            userId: interaction.user.id,
            targetId: targetUser.id,
        });
    }
    catch (e) {
        log("unlink_command_error", {
            userId: interaction.user.id,
            targetId: targetUser.id,
            error: e instanceof Error ? e.message : String(e),
        });
        await interaction.reply({
            embeds: [
                createErrorEmbed("Erreur", `Une erreur s'est produite: ${e instanceof Error ? e.message : "Erreur inconnue"}`),
            ],
            flags: MessageFlags.Ephemeral,
        });
    }
}
// ─────────────────────────────────────────────────────────────
// Unlink Button Handlers
// ─────────────────────────────────────────────────────────────
export async function handleUnlinkButtonInteraction(interaction, client) {
    const [, action, targetId] = interaction.customId.split(":");
    log("unlink_button_click", {
        button: interaction.customId,
        userId: interaction.user.id,
        targetId,
    });
    // Verify chef role
    const isChef = await hasChefRole(interaction);
    if (!isChef) {
        // ✅ After deferUpdate, use followUp
        await interaction.followUp({
            embeds: [
                createErrorEmbed("Accès Refusé", "Vous n'avez pas les permissions pour cette action."),
            ],
            flags: MessageFlags.Ephemeral,
        });
        return;
    }
    // Handle cancel
    if (action === "cancel") {
        try {
            if (interaction.message) {
                await interaction.message.edit({
                    components: [],
                });
            }
            // ✅ After deferUpdate, use followUp
            await interaction.followUp({
                embeds: [createCancelledEmbed()],
                flags: MessageFlags.Ephemeral,
            });
            log("unlink_cancelled", {
                userId: interaction.user.id,
                targetId,
            });
        }
        catch (e) {
            console.error("[unlink error]", e instanceof Error ? e.message : String(e), e instanceof Error ? e.stack : "");
            log("unlink_cancel_error", {
                error: e instanceof Error ? e.message : String(e),
                stack: e instanceof Error ? e.stack : undefined,
            });
            try {
                const safeMessage = e instanceof Error ? e.message.substring(0, 100) : "Erreur inconnue";
                await interaction.followUp({
                    content: `❌ Erreur: ${safeMessage}`,
                    flags: MessageFlags.Ephemeral,
                });
            }
            catch {
                // ignore
            }
        }
        return;
    }
    // Handle confirm delete
    if (action === "confirm") {
        try {
            const success = await deleteMemberLink(targetId);
            if (success) {
                // ✅ After deferUpdate, use followUp
                await interaction.followUp({
                    embeds: [
                        createSuccessEmbed("Liaison Supprimée", `✅ La liaison de <@${targetId}> a été supprimée avec succès.`),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
                // Also update the original message to remove buttons
                if (interaction.message) {
                    await interaction.message.edit({
                        components: [],
                    });
                }
                log("unlink_delete_ok", {
                    userId: interaction.user.id,
                    targetId,
                });
                // Log to staff channel
                await logToChannel(client, `🗑️ **Liaison Supprimée** - <@${interaction.user.id}> a supprimé la liaison de <@${targetId}> via /unlink`);
            }
            else {
                // ✅ After deferUpdate, use followUp
                await interaction.followUp({
                    embeds: [
                        createErrorEmbed("Erreur", "Impossible de supprimer la liaison (utilisateur non lié?)."),
                    ],
                    flags: MessageFlags.Ephemeral,
                });
                log("unlink_delete_failed", {
                    userId: interaction.user.id,
                    targetId,
                    reason: "API returned null",
                });
            }
        }
        catch (e) {
            console.error("[unlink error]", e instanceof Error ? e.message : String(e), e instanceof Error ? e.stack : "");
            log("unlink_delete_error", {
                userId: interaction.user.id,
                targetId,
                error: e instanceof Error ? e.message : String(e),
                stack: e instanceof Error ? e.stack : undefined,
            });
            try {
                const safeMessage = e instanceof Error ? e.message.substring(0, 100) : "Erreur inconnue";
                await interaction.followUp({
                    content: `❌ Erreur: ${safeMessage}`,
                    flags: MessageFlags.Ephemeral,
                });
            }
            catch {
                // ignore
            }
        }
    }
}
// ─────────────────────────────────────────────────────────────
// Logging to Discord Channel
// ─────────────────────────────────────────────────────────────
async function logToChannel(client, message) {
    try {
        const logsChannelId = IDS.TICKETS_LOGS_CHANNEL_ID;
        if (!logsChannelId)
            return;
        const channel = await client.channels.fetch(logsChannelId);
        if (!channel || !("send" in channel))
            return;
        const embed = new EmbedBuilder()
            .setTitle("🔗 Liaison")
            .setDescription(message)
            .setColor(0x5865f2)
            .setTimestamp()
            .setFooter({ text: "Discord Worker" });
        await channel.send({ embeds: [embed] });
    }
    catch (e) {
        log("log_to_channel_error", {
            error: e instanceof Error ? e.message : String(e),
        });
    }
}
