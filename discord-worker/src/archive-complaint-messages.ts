/**
 * Archive Complaint Ticket Messages
 * Retrieves all messages from a complaint ticket channel and stores them in ComplaintMessage
 */

import type { ThreadChannel, Guild, Collection, Message, TextChannel } from "discord.js";
import { logInfo, logWarn, logError } from "./lib/worker-obs.js";
import { getInternalPanelUrl } from "./lib/urls.js";
import { fetchWithTimeout } from "./lib/http.js";

/** Appels internes worker -> panel : 15 s. */
const INTERNAL_TIMEOUT_MS = 15_000;

const PANEL_URL = getInternalPanelUrl();
const INGEST_SECRET = process.env.INGEST_SECRET;

export interface ArchivedMessage {
  discordMessageId: string;
  authorDiscordId: string;
  authorNameSnapshot: string;
  content: string;
  attachmentsJson?: Record<string, any>[];
  createdAtDiscord: string;
  editedAtDiscord?: string;
  deletedAtDiscord?: string;
}

/**
 * Fetch all messages from a complaint channel and archive them to panel
 */
export async function archiveComplaintThreadMessages(params: {
  threadId: string;
  ticketKey: string;
  guild: Guild;
}): Promise<{ ok: boolean; messageCount?: number; error?: string }> {
  const { threadId, ticketKey, guild } = params;

  try {
    // Fetch thread or text channel
    let ticketChannel: ThreadChannel | TextChannel | null = null;
    try {
      const channel = await guild.channels.fetch(threadId);
      if (channel?.isThread()) {
        ticketChannel = channel as ThreadChannel;
      } else if (channel?.isTextBased() && channel.type === 0) {
        ticketChannel = channel as TextChannel;
      }
    } catch (fetchErr) {
      logWarn("complaint_thread_fetch_failed", { threadId, ticketKey, error: fetchErr instanceof Error ? fetchErr.message : String(fetchErr) });
      return { ok: false, error: "Channel not found or not accessible" };
    }

    if (!ticketChannel) {
      logWarn("complaint_thread_not_thread", { threadId, ticketKey });
      return { ok: false, error: "Channel is not archivable" };
    }

    // Fetch all messages from thread
    const messages: ArchivedMessage[] = [];
    let lastMessage: string | undefined = undefined;
    let pageCount = 0;
    const MAX_PAGES = 50; // Safety limit

    logInfo("complaint_archive_start", { threadId, ticketKey });

    while (pageCount < MAX_PAGES) {
      try {
        const batch: Collection<string, Message> = await ticketChannel.messages.fetch({
          limit: 100,
          before: lastMessage,
        });

        if (batch.size === 0) break;

        for (const [_, msg] of batch) {
          const authorNameSnapshot = msg.author
            ? `${msg.author.username}${msg.author.discriminator !== "0" ? "#" + msg.author.discriminator : ""}`
            : "Unknown";

          const attachmentsJson = msg.attachments.size > 0
            ? msg.attachments.map((att: any) => ({
                id: att.id,
                name: att.name,
                size: att.size,
                url: att.url,
                contentType: att.contentType,
              }))
            : undefined;

          messages.push({
            discordMessageId: msg.id,
            authorDiscordId: msg.author?.id || "unknown",
            authorNameSnapshot,
            content: msg.content || "",
            attachmentsJson: attachmentsJson ? (attachmentsJson as any) : undefined,
            createdAtDiscord: msg.createdAt.toISOString(),
            editedAtDiscord: msg.editedAt?.toISOString(),
            deletedAtDiscord: undefined, // Message is not deleted if we can read it
          });
        }

        // Set cursor to earliest message in batch for pagination
        lastMessage = batch.last()?.id;
        pageCount++;
      } catch (err) {
        logWarn("complaint_archive_batch_error", { threadId, ticketKey, pageCount, error: err instanceof Error ? err.message : String(err) });
        // Continue with what we have
        break;
      }
    }

    // Sort messages by creation time (ascending)
    messages.sort((a, b) => new Date(a.createdAtDiscord).getTime() - new Date(b.createdAtDiscord).getTime());

    logInfo("complaint_archive_fetched", { threadId, ticketKey, messageCount: messages.length });

    // Send to panel API to store in ComplaintMessage
    if (messages.length > 0) {
      const archiveResult = await sendArchivedMessagesToPanel(ticketKey, messages);
      if (!archiveResult.ok) {
        logWarn("complaint_archive_api_failed", { ticketKey, error: archiveResult.error });
        return { ok: false, error: archiveResult.error };
      }
    }

    logInfo("complaint_archive_success", { threadId, ticketKey, messageCount: messages.length });
    return { ok: true, messageCount: messages.length };
  } catch (error) {
    logError("complaint_archive_error", { threadId, ticketKey }, error as Error);
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Send archived messages to panel for storage
 */
async function sendArchivedMessagesToPanel(
  ticketKey: string,
  messages: ArchivedMessage[]
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!INGEST_SECRET) {
      logWarn("complaint_archive_secret_missing", { ticketKey });
      return { ok: false, error: "INGEST_SECRET not configured" };
    }

    const url = `${PANEL_URL}/api/ingest/complaint/messages-archive`;
    const response = await fetchWithTimeout(url, {
      method: "POST",
      timeoutMs: INTERNAL_TIMEOUT_MS,
      headers: {
        "Content-Type": "application/json",
        "x-ingest-secret": INGEST_SECRET,
      },
      body: JSON.stringify({
        ticketKey,
        messages,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      logWarn("complaint_archive_api_http_error", { ticketKey, status: response.status, error: data.error });
      return { ok: false, error: data.error || `HTTP ${response.status}` };
    }

    if (!data.ok) {
      logWarn("complaint_archive_api_not_ok", { ticketKey, error: data.error });
      return { ok: false, error: data.error || "API returned not ok" };
    }

    return { ok: true };
  } catch (error) {
    logError("complaint_archive_api_call_failed", { ticketKey }, error as Error);
    return { ok: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}
