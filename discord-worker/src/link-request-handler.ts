/**
 * Link Request Handler - Real DB actions for LinkRequest buttons
 * 
 * Handles: ACCEPT (linkreq:open), REFUSE (linkreq:refuse), ARCHIVE (linkreq:archive)
 * 
 * Actions:
 * 1. ACCEPT: Update LinkRequest status=ACCEPTED + create/update Member with discordId
 * 2. REFUSE: Update LinkRequest status=REFUSED
 * 3. ARCHIVE: Update LinkRequest status=ARCHIVED
 * 
 * Security:
 * - Only Chef Famille or Etat Major can handle requests
 * - Requester cannot handle their own request
 * - Idempotent: returns alreadyHandled if status already processed
 */

import { Client, EmbedBuilder } from "discord.js";
import { IDS } from "./ids.js";

const ROLE_ID_REGEX = /^[0-9]{17,20}$/;

const ALLOWED_ROLES = [IDS.CHEF_FAMILLE_ROLE_ID, IDS.ETAT_MAJOR_ROLE_ID].filter(
  (id): id is string => typeof id === "string" && ROLE_ID_REGEX.test(id)
);

interface LinkRequestHandlerOptions {
  requestId: string;
  requesterDiscordId: string;
  clickerId: string;
  clickerName: string;
  action: "accept" | "refuse" | "archive";
  message: any; // Discord Message object
  interaction: any; // Discord Interaction object
}

interface HandleResult {
  ok: boolean;
  alreadyHandled?: boolean;
  status?: string;
  error?: string;
  reason?: string;
}

function log(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({
    event,
    ...data,
    timestamp: new Date().toISOString(),
  }));
}

/**
 * Check if user has permission to handle link requests
 */
function checkPermissions(
  member: any | null,
  clickerId: string,
  requesterDiscordId: string
): { ok: boolean; reason?: string } {
  // Guard 1: Requester cannot handle their own request
  if (clickerId === requesterDiscordId) {
    return {
      ok: false,
      reason: "Vous ne pouvez pas traiter votre propre demande.",
    };
  }

  // Guard 2: Must have appropriate role
  if (!member) {
    return {
      ok: false,
      reason: "Membre non trouvé sur le serveur.",
    };
  }

  if (ALLOWED_ROLES.length === 0) {
    return {
      ok: false,
      reason: "Rôles Discord non configurés.",
    };
  }

  const hasRole = ALLOWED_ROLES.some((roleId) => member.roles.cache.has(roleId));
  if (!hasRole) {
    return {
      ok: false,
      reason: "Seuls Chef Famille et Etat Major peuvent traiter les demandes.",
    };
  }

  return { ok: true };
}

/**
 * Handle LinkRequest action via Panel API
 */
export async function handleLinkRequestAction(
  client: Client,
  options: LinkRequestHandlerOptions
): Promise<HandleResult> {
  const { requestId, requesterDiscordId, clickerId, clickerName, action, message, interaction } = options;

  try {
    // Log action attempt
    log("linkreq_action_start", {
      action,
      requestId,
      requesterDiscordId,
      clickerId,
      clickerName,
    });

    // Check permissions via Discord member
    const guild = client.guilds.cache.get(IDS.GUILD_ID);
    if (!guild) {
      return { ok: false, error: "Guild not found" };
    }

    const member = await guild.members.fetch(clickerId).catch(() => null);
    const permCheck = checkPermissions(member, clickerId, requesterDiscordId);
    if (!permCheck.ok) {
      log("linkreq_permission_denied", {
        requestId,
        clickerId,
        reason: permCheck.reason,
      });

      return {
        ok: false,
        error: permCheck.reason || "Permission denied",
        reason: permCheck.reason,
      };
    }

    // Call Panel API
    const endpoint = action === "accept" ? "accept" : action === "refuse" ? "refuse" : "archive";
    const apiUrl = `${IDS.PANEL_BASE_URL}/api/ingest/link-requests/${requestId}/${endpoint}`;

    console.log("[linkreq:api_call]", { action, requestId, apiUrl });

    const apiResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-ingest-secret": process.env.INGEST_SECRET || "",
      },
      body: JSON.stringify({
        clickerId,
        clickerName,
        channelId: interaction?.channelId,
        messageId: message?.id,
      }),
    });

    // Check content-type before parsing JSON
    const contentType = apiResponse.headers.get("content-type") || "";
    console.log("[linkreq:api_response]", {
      action,
      requestId,
      status: apiResponse.status,
      contentType,
    });

    // If HTML response (redirect, login page, etc.), log and fail gracefully
    if (contentType.includes("text/html") || apiResponse.status === 301 || apiResponse.status === 302 || apiResponse.status === 307 || apiResponse.status === 308) {
      const htmlBody = await apiResponse.text();
      const snippet = htmlBody.substring(0, 200);
      console.error("[linkreq:api_error]", {
        action,
        requestId,
        error: "Received HTML instead of JSON (likely redirect or auth gate)",
        status: apiResponse.status,
        contentType,
        bodySnippet: snippet,
      });

      return {
        ok: false,
        error: `API returned HTML (status ${apiResponse.status}). This usually means the middleware is redirecting to login. Check that /api/ingest/* is in PUBLIC_PATH_PREFIXES.`,
        status: apiResponse.status.toString(),
      };
    }

    let apiData;
    try {
      apiData = await apiResponse.json();
    } catch (parseErr) {
      console.error("[linkreq:api_parse_error]", {
        action,
        requestId,
        error: parseErr instanceof Error ? parseErr.message : "Unknown parse error",
        status: apiResponse.status,
        contentType,
      });

      return {
        ok: false,
        error: `Failed to parse API response: ${parseErr instanceof Error ? parseErr.message : "Unknown error"}`,
        status: apiResponse.status.toString(),
      };
    }

    if (!apiResponse.ok) {
      log("linkreq_api_error", {
        action,
        requestId,
        status: apiResponse.status,
        error: apiData.error,
      });

      return {
        ok: false,
        error: apiData.error || "API request failed",
        status: apiResponse.status.toString(),
      };
    }

    log("linkreq_api_success", {
      action,
      requestId,
      alreadyHandled: apiData.alreadyHandled,
      status: apiData.status,
    });

    // If already handled, update message to show "Déjà traité" status
    if (apiData.alreadyHandled) {
      await updateLinkRequestMessageAlreadyHandled(message, apiData.status);
      return {
        ok: true,
        alreadyHandled: true,
        status: apiData.status,
      };
    }

    // Update Discord message with decision
    await updateLinkRequestMessage(message, action, clickerId, clickerName);

    return {
      ok: true,
      alreadyHandled: false,
      status: apiData.status,
    };

  } catch (error) {
    log("linkreq_handler_error", {
      requestId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Update Discord message to show decision
 */
async function updateLinkRequestMessage(
  message: any,
  action: "accept" | "refuse" | "archive",
  clickerId: string,
  clickerName: string
): Promise<void> {
  if (!message || !message.embeds || !message.embeds[0]) {
    console.warn("[linkreq] Message not found or no embeds to update");
    return;
  }

  try {
    const actionConfig: Record<string, { emoji: string; label: string; color: number }> = {
      accept: { emoji: "✅", label: "Acceptée", color: 0x10b981 },
      refuse: { emoji: "❌", label: "Refusée", color: 0xef4444 },
      archive: { emoji: "📦", label: "Archivée", color: 0x6b7280 },
    };

    const config = actionConfig[action];
    const existingEmbed = message.embeds[0];

    const updatedEmbed = new EmbedBuilder(existingEmbed.data)
      .addFields({
        name: "📋 Décision",
        value: `${config.emoji} **${config.label}**`,
      })
      .addFields({
        name: "👤 Par",
        value: `<@${clickerId}> (${clickerName})`,
      })
      .addFields({
        name: "🕐 Date",
        value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
      })
      .setColor(config.color);

    await message.edit({
      embeds: [updatedEmbed],
      components: [], // Disable all buttons
    });

    log("linkreq_message_updated", {
      messageId: message.id,
      action,
      clickerId,
    });

  } catch (error) {
    console.error("[linkreq:update_message]", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/**
 * Update Discord message to show "Déjà traité (STATUS)" when link-request already handled
 */
async function updateLinkRequestMessageAlreadyHandled(
  message: any,
  status: string
): Promise<void> {
  if (!message || !message.embeds || !message.embeds[0]) {
    console.warn("[linkreq] Message not found or no embeds to update");
    return;
  }

  try {
    // Status mapping for French labels
    const statusLabels: Record<string, string> = {
      ACCEPTED: "ACCEPTÉ",
      REFUSED: "REFUSÉ",
      ARCHIVED: "ARCHIVÉ",
    };

    const label = statusLabels[status] || status;
    const existingEmbed = message.embeds[0];

    const updatedEmbed = new EmbedBuilder(existingEmbed.data)
      .addFields({
        name: "📋 Décision",
        value: `⚠️ **Déjà traité (${label})**`,
      })
      .setColor(0xf59e0b); // Amber color for "already handled"

    await message.edit({
      embeds: [updatedEmbed],
      components: [], // Disable all buttons
    });

    log("linkreq_message_already_handled", {
      messageId: message.id,
      status,
    });

  } catch (error) {
    console.error("[linkreq:update_message_already_handled]", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

/**
 * Send channel notification about decision
 */
export async function sendLinkRequestDecisionMessage(
  message: any,
  action: "accept" | "refuse" | "archive",
  clickerId: string,
  requesterDiscordId: string
): Promise<void> {
  const actionConfig: Record<string, string> = {
    accept: "✅ Acceptée",
    refuse: "❌ Refusée",
    archive: "📦 Archivée",
  };

  const label = actionConfig[action];

  try {
    const channel = message.channel;
    if (!channel || !("send" in channel)) {
      console.warn("[linkreq] Channel not available for notification");
      return;
    }

    await channel.send({
      content: `${label} par <@${clickerId}> - <@${requesterDiscordId}>`,
    });

    log("linkreq_notification_sent", {
      action,
      clickerId,
      requesterDiscordId,
      channelId: channel.id,
    });

  } catch (error) {
    console.error("[linkreq:send_notification]", error instanceof Error ? error.message : String(error));
  }
}

/**
 * Send ephemeral confirmation to clicker
 */
export function getActionConfirmation(action: "accept" | "refuse" | "archive"): string {
  const confirmations: Record<string, string> = {
    accept: "✅ Liaison acceptée avec succès.",
    refuse: "❌ Demande refusée avec succès.",
    archive: "📦 Demande archivée avec succès.",
  };

  return confirmations[action];
}
/**
 * Send DM to user when link is accepted
 * This notifies them to refresh /me to see linked status
 */
export async function sendLinkAcceptedDM(
  client: Client,
  requesterDiscordId: string
): Promise<void> {
  try {
    const user = await client.users.fetch(requesterDiscordId);
    if (!user) {
      console.warn("[linkreq:dm] User not found", { requesterDiscordId });
      return;
    }

    const panelBaseUrl = (process.env.NEXTAUTH_URL ?? process.env.INGEST_BASE_URL ?? "https://losesperados.fr").replace(/\/+$/, "");
    const embed = new EmbedBuilder()
      .setTitle("✅ Liaison Acceptée")
      .setColor(0x10b981)
      .setDescription("Votre demande de liaison a été acceptée par un staff member!")
      .addFields({
        name: "Prochaine étape",
        value: `Rendez-vous sur ${panelBaseUrl}/me pour voir votre nouveau statut`,
      })
      .setTimestamp();

    await user.send({
      embeds: [embed],
    });

    log("linkreq_dm_sent", {
      requesterDiscordId,
      action: "accept",
    });

  } catch (error) {
    // Non-blocking: DM send failures are not critical
    console.warn("[linkreq:dm_error]", error instanceof Error ? error.message : String(error), {
      requesterDiscordId,
    });
  }
}