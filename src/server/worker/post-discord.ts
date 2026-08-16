import { getInternalWorkerUrl } from "@/lib/urls";

type DiscordMessagePayload = {
  channelId: string;
  content?: string;
  embeds?: unknown[];
};

type PostDiscordResult =
  | { ok: true; messageId: string }
  | { ok: false; error: string };

type DiscordRenamePayload = {
  discordId: string;
  rpName: string | null | undefined;
  reason?: string;
};

type PostDiscordRenameResult =
  | { ok: true; nickname: string | null }
  | { ok: false; error: string; skipped?: string };

const WORKER_INTERNAL_URL = getInternalWorkerUrl();
const MESSAGE_ENDPOINT = "/internal/discord/postMessage";
const RENAME_ENDPOINT = "/internal/discord/rename";
const MESSAGE_FULL_URL = `${WORKER_INTERNAL_URL}${MESSAGE_ENDPOINT}`;
const RENAME_FULL_URL = `${WORKER_INTERNAL_URL}${RENAME_ENDPOINT}`;
const DEFAULT_TIMEOUT_MS = 7000;
const DEBUG = process.env.DEBUG_DISCORD_POST === "true" || process.env.NODE_ENV !== "production";

export async function postDiscordMessage(
  payload: DiscordMessagePayload,
  opts?: { timeoutMs?: number }
): Promise<PostDiscordResult> {
  const secret = process.env.INGEST_SECRET;
  if (!secret) {
    const err = "INGEST_SECRET missing in panel env";
    if (DEBUG) console.error(`[discord-post] ${err}`);
    return { ok: false, error: err };
  }

  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  if (DEBUG) {
    console.log("[discord-post] request", {
      url: MESSAGE_FULL_URL,
      channelId: payload.channelId,
      hasContent: !!payload.content,
      embeds: payload.embeds?.length ?? 0,
      timeoutMs,
    });
  }

  try {
    const res = await fetch(MESSAGE_FULL_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ingest-secret": secret,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => null);

    if (DEBUG) {
      console.log("[discord-post] response", {
        status: res.status,
        ok: res.ok,
        body: data,
      });
    }

    if (!res.ok || !data?.ok) {
      const message = data?.error || `HTTP ${res.status}`;
      if (DEBUG) console.error(`[discord-post] failed: ${message}`);
      return { ok: false, error: message };
    }

    if (DEBUG) console.log("[discord-post] success", { messageId: data.messageId });
    return { ok: true, messageId: data.messageId ?? "unknown" };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (DEBUG) console.error(`[discord-post] error: ${message}`);
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Post a rename request to Discord worker
 * Attempts to rename a member on Discord
 *
 * @param payload Rename payload (discordId, rpName, reason)
 * @param opts Optional overrides
 * @returns Result with ok status and nickname or error
 */
export async function postDiscordRename(
  payload: DiscordRenamePayload,
  opts?: { timeoutMs?: number }
): Promise<PostDiscordRenameResult> {
  const secret = process.env.INGEST_SECRET;
  if (!secret) {
    const err = "INGEST_SECRET missing in panel env";
    if (DEBUG) console.error(`[discord-rename] ${err}`);
    return { ok: false, error: err };
  }

  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  if (DEBUG) {
    console.log("[discord-rename] request", {
      url: RENAME_FULL_URL,
      discordId: payload.discordId,
      rpName: payload.rpName,
      timeoutMs,
    });
  }

  try {
    const res = await fetch(RENAME_FULL_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-ingest-secret": secret,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => null);

    if (DEBUG) {
      console.log("[discord-rename] response", {
        status: res.status,
        ok: res.ok,
        body: data,
      });
    }

    if (!res.ok || !data?.ok) {
      const message = data?.error || `HTTP ${res.status}`;
      const skipped = data?.skipped;
      if (DEBUG) console.error(`[discord-rename] failed: ${message}`);
      return { ok: false, error: message, skipped };
    }

    if (DEBUG) console.log("[discord-rename] success", { nickname: data.nickname });
    return { ok: true, nickname: data.nickname ?? null };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (DEBUG) console.error(`[discord-rename] error: ${message}`);
    return { ok: false, error: message };
  } finally {
    clearTimeout(timeout);
  }
}
