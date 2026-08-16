/**
 * Archivage des messages d'un ticket de recrutement.
 *
 * Appelé au moment de la décision, avant que le fil ne soit verrouillé puis
 * archivé — et éventuellement supprimé à la main. Sans cette copie, la
 * conversation qui justifie la décision disparaît.
 *
 * Elle sert deux usages : la lecture depuis le site, et la rédaction de
 * l'explication envoyée au candidat refusé.
 *
 * Différence avec la version plaintes : on aplatit aussi les embeds. La
 * candidature est postée par le bot sous cette forme, donc s'en tenir au
 * `content` archiverait une conversation sans son point de départ.
 */

import type { Client as DiscordClient, Collection, Message } from "discord.js";
import { logInfo, logWarn, logError } from "../../lib/worker-obs.js";
import { getInternalPanelUrl } from "../../lib/urls.js";
import { fetchWithTimeout } from "../../lib/http.js";

/** Appels internes worker -> panel : 15 s. */
const INTERNAL_TIMEOUT_MS = 15_000;

const PANEL_URL = getInternalPanelUrl();
const INGEST_SECRET = process.env.INGEST_SECRET;

/** Les tickets utiles tiennent largement dedans ; au-delà on ne gagne rien. */
const MAX_MESSAGES = 500;

export interface ArchivedMessage {
  discordMessageId: string;
  authorDiscordId: string;
  authorNameSnapshot: string;
  authorIsBot: boolean;
  content: string;
  embedsText?: string;
  attachmentsJson?: Record<string, unknown>[];
  createdAtDiscord: string;
  editedAtDiscord?: string;
}

/** Titre, description et champs d'un embed, aplatis en texte lisible. */
function flattenEmbeds(msg: Message): string {
  const parts: string[] = [];
  for (const e of msg.embeds) {
    if (e.title) parts.push(e.title);
    if (e.description) parts.push(e.description);
    for (const f of e.fields ?? []) parts.push(`${f.name} : ${f.value}`);
    if (e.footer?.text) parts.push(e.footer.text);
  }
  return parts.join("\n").trim();
}

/**
 * Lit le fil, du plus ancien au plus récent.
 * Renvoie une liste vide si le salon est introuvable ou illisible.
 */
export async function readRecruitmentThread(
  client: DiscordClient,
  threadId: string,
): Promise<ArchivedMessage[]> {
  const channel = await client.channels.fetch(threadId).catch(() => null);
  if (!channel || !("messages" in channel)) return [];

  const collected: Message[] = [];
  let before: string | undefined;

  while (collected.length < MAX_MESSAGES) {
    const batch: Collection<string, Message> | null = await (channel as any).messages
      .fetch({ limit: 100, before })
      .catch(() => null);
    if (!batch || batch.size === 0) break;

    for (const msg of batch.values()) collected.push(msg);
    before = batch.last()?.id;
    if (batch.size < 100) break;
  }

  // Discord renvoie du plus récent au plus ancien : on remet dans l'ordre de
  // lecture, celui qui compte pour comprendre une conversation.
  return collected.reverse().map((msg) => {
    const embedsText = flattenEmbeds(msg);
    return {
      discordMessageId: msg.id,
      authorDiscordId: msg.author?.id ?? "unknown",
      authorNameSnapshot:
        msg.member?.displayName ?? msg.author?.username ?? "Unknown",
      authorIsBot: Boolean(msg.author?.bot),
      content: msg.content ?? "",
      embedsText: embedsText || undefined,
      attachmentsJson:
        msg.attachments.size > 0
          ? msg.attachments.map((a) => ({ name: a.name, url: a.url, size: a.size }))
          : undefined,
      createdAtDiscord: msg.createdAt.toISOString(),
      editedAtDiscord: msg.editedAt?.toISOString(),
    };
  });
}

/** Envoie la copie au panel. Non bloquant : un échec ne doit pas casser la décision. */
export async function archiveRecruitmentMessages(params: {
  client: DiscordClient;
  threadId: string;
  ticketKey: string;
}): Promise<{ ok: boolean; messageCount: number; messages: ArchivedMessage[] }> {
  const { client, threadId, ticketKey } = params;

  try {
    const messages = await readRecruitmentThread(client, threadId);
    if (messages.length === 0) {
      logWarn("recruitment_archive_empty", { threadId, ticketKey });
      return { ok: false, messageCount: 0, messages: [] };
    }

    if (!INGEST_SECRET) {
      logWarn("recruitment_archive_secret_missing", { ticketKey });
      // Les messages sont quand même renvoyés : l'explication au candidat peut
      // s'en servir même si la copie en base n'a pas pu être écrite.
      return { ok: false, messageCount: messages.length, messages };
    }

    const res = await fetchWithTimeout(`${PANEL_URL}/api/ingest/recruitment/messages-archive`, {
      method: "POST",
      timeoutMs: INTERNAL_TIMEOUT_MS,
      headers: {
        "Content-Type": "application/json",
        "x-ingest-secret": INGEST_SECRET,
      },
      body: JSON.stringify({ ticketKey, messages }),
    });

    if (!res.ok) {
      logWarn("recruitment_archive_api_failed", {
        ticketKey,
        status: res.status,
        body: (await res.text().catch(() => "")).slice(0, 300),
      });
      return { ok: false, messageCount: messages.length, messages };
    }

    logInfo("recruitment_archive_success", { threadId, ticketKey, messageCount: messages.length });
    return { ok: true, messageCount: messages.length, messages };
  } catch (error) {
    logError("recruitment_archive_error", { threadId, ticketKey }, error as Error);
    return { ok: false, messageCount: 0, messages: [] };
  }
}

/**
 * Archivage au fil de l'eau.
 *
 * L'archivage à la décision perdait une course : le staff supprime le salon du
 * ticket aussitôt tranché, souvent avant que le job d'outbox ne soit traité —
 * et un salon supprimé emporte ses messages. En enregistrant chaque message à
 * la seconde où il est écrit, le moment de la suppression n'a plus d'importance.
 *
 * Effet de bord utile : la conversation devient lisible sur le site pendant que
 * le ticket est encore ouvert, pas seulement après coup.
 */

/** Salon parent des tickets. Vide = archivage au fil de l'eau désactivé. */
const TICKETS_PARENT_CHANNEL_ID = process.env.TICKETS_PARENT_CHANNEL_ID ?? "";

/** Un ticket de recrutement : par son parent, ou par son préfixe de nom. */
function isRecruitmentTicket(channel: any): boolean {
  if (TICKETS_PARENT_CHANNEL_ID && channel?.parentId === TICKETS_PARENT_CHANNEL_ID) {
    return String(channel?.name ?? "").toLowerCase().startsWith("recrutement-");
  }
  return String(channel?.name ?? "").toLowerCase().startsWith("recrutement-");
}

export async function archiveSingleMessage(msg: Message): Promise<void> {
  const channel = msg.channel as any;
  if (!isRecruitmentTicket(channel)) return;
  if (!INGEST_SECRET) return;

  const embedsText = flattenEmbeds(msg);
  // Un message sans texte ni embed (réaction, épingle) n'apporte rien.
  if (!msg.content?.trim() && !embedsText) return;

  const payload: ArchivedMessage = {
    discordMessageId: msg.id,
    authorDiscordId: msg.author?.id ?? "unknown",
    authorNameSnapshot: msg.member?.displayName ?? msg.author?.username ?? "Unknown",
    authorIsBot: Boolean(msg.author?.bot),
    content: msg.content ?? "",
    embedsText: embedsText || undefined,
    attachmentsJson:
      msg.attachments.size > 0
        ? msg.attachments.map((a) => ({ name: a.name, url: a.url, size: a.size }))
        : undefined,
    createdAtDiscord: msg.createdAt.toISOString(),
  };

  try {
    // La route retrouve le recrutement par sa clé de ticket ; on la déduit du
    // salon via le panel, qui garde le lien discordThreadId → ticketKey.
    const res = await fetchWithTimeout(`${PANEL_URL}/api/ingest/recruitment/messages-archive`, {
      method: "POST",
      timeoutMs: INTERNAL_TIMEOUT_MS,
      headers: { "Content-Type": "application/json", "x-ingest-secret": INGEST_SECRET },
      body: JSON.stringify({ channelId: channel.id, messages: [payload] }),
    });
    if (!res.ok && res.status !== 404) {
      // 404 = salon sans fiche liée (ticket non ingéré) : rien à signaler.
      logWarn("recruitment_live_archive_failed", { channelId: channel.id, status: res.status });
    }
  } catch (err) {
    logWarn("recruitment_live_archive_error", {
      channelId: channel.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
