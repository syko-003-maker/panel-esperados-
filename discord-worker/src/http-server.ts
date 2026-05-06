/**
 * HTTP Server for Discord Worker
 * Receives contact notifications from the site
 */

import express, { type Express, type Request, type Response } from "express";
import type { Server } from "http";
import type { Client } from "discord.js";
import { sendContactNotification } from "./contact-notification.js";
import { postLinkRequestMessage } from "./link-request-post.js";
import { renameMemberIfPossible, formatRenameResult } from "./features/rename/renameMember.js";

const WORKER_SECRET = process.env.INGEST_SECRET || process.env.DISCORD_WORKER_SECRET;
const PORT = parseInt(process.env.WORKER_HTTP_PORT || "3001", 10);

// Rate limiting for rename endpoint (key: discordId, value: timestamps)
const renameRateLimitMap = new Map<string, number[]>();
const RENAME_RATE_LIMIT_MAX = 5; // 5 requests
const RENAME_RATE_LIMIT_WINDOW_MS = 60_000; // per minute

let app: Express | null = null;
let server: Server | null = null;

function log(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({
    event,
    ...data,
    timestamp: new Date().toISOString(),
  }));
}

function logError(event: string, error: unknown, data: Record<string, unknown> = {}) {
  console.error(JSON.stringify({
    event,
    error: error instanceof Error ? error.message : String(error),
    ...data,
    timestamp: new Date().toISOString(),
  }));
}

/**
 * Check rate limit for a key (discordId)
 * Returns true if within limit, false if exceeded
 */
function checkRenameRateLimit(discordId: string): boolean {
  const now = Date.now();
  const timestamps = renameRateLimitMap.get(discordId) || [];

  // Remove old timestamps outside the window
  const recentTimestamps = timestamps.filter((ts) => now - ts < RENAME_RATE_LIMIT_WINDOW_MS);

  // Check if limit exceeded
  if (recentTimestamps.length >= RENAME_RATE_LIMIT_MAX) {
    return false;
  }

  // Update map with new timestamp
  recentTimestamps.push(now);
  renameRateLimitMap.set(discordId, recentTimestamps);

  return true;
}

/**
 * Initialize HTTP server for contact notifications
 */
export function initWorkerServer(client: Client): { start: () => Promise<void>; stop: () => Promise<void> } {
  app = express();
  app.use(express.json());

  // Health check endpoints — répondent à /health ET /api/health
  // (le panel watchdog ping 127.0.0.1:3001/health, certaines healthchecks externes /api/health)
  const healthHandler = (_req: Request, res: Response) => {
    res.json({
      ok: true,
      service: "discord-worker",
      uptimeSec: Math.round(process.uptime()),
      pid: process.pid,
    });
  };
  app.get("/health", healthHandler);
  app.get("/api/health", healthHandler);

  /**
   * POST /api/worker/contact-notification
   * Receive contact notification from site
   * 
   * Body:
   * {
   *   "discordId": "123456789",
   *   "username": "PlayerName",
   *   "steamId": "76561198123456789" (optional),
   *   "rpName": "Character Name" (optional)
   * }
   */
  app.post("/api/worker/contact-notification", async (req: Request, res: Response) => {
    try {
      const { discordId, username, steamId, rpName } = req.body;

      // Validate required fields
      if (!discordId || !username) {
        return res.status(400).json({
          ok: false,
          error: "Missing required fields: discordId, username",
        });
      }

      // Optional: Validate secret from site
      const authHeader = req.headers.authorization;
      const isValidSecret = WORKER_SECRET && authHeader?.replace("Bearer ", "") === WORKER_SECRET;
      const xSecret = req.headers["x-ingest-secret"] as string;
      const isValidXSecret = WORKER_SECRET && xSecret === WORKER_SECRET;

      // Allow from site without auth, or with valid secret
      if (authHeader && !isValidSecret && !isValidXSecret) {
        return res.status(401).json({
          ok: false,
          error: "Unauthorized",
        });
      }

      // Send notification to Discord
      const result = await sendContactNotification(client, {
        discordId,
        username,
        steamId,
        rpName,
      });

      if (!result.ok) {
        return res.status(500).json({
          ok: false,
          error: result.error,
        });
      }

      res.json({
        ok: true,
        message: "Contact notification sent",
        discordId,
      });
    } catch (error: unknown) {
      logError("contact_notification_endpoint_error", error, {
        endpoint: "/api/worker/contact-notification",
      });
      res.status(500).json({
        ok: false,
        error: "Failed to process contact notification",
      });
    }
  });

  /**
   * POST /api/worker/link-request/post
   * Post a link request message to Discord
   * 
   * Body:
   * {
   *   "requestId": "cm123...",
   *   "discordId": "123456789",
   *   "username": "Username"
   * }
   */
  app.post("/api/worker/link-request/post", async (req: Request, res: Response) => {
    try {
      // Validate secret
      const xSecret = req.headers["x-ingest-secret"] as string;
      const isValidXSecret = WORKER_SECRET && xSecret === WORKER_SECRET;

      if (!isValidXSecret) {
        return res.status(401).json({
          ok: false,
          error: "Unauthorized",
        });
      }

      const { requestId, discordId, username } = req.body;

      // Validate required fields
      if (!requestId || !discordId || !username) {
        return res.status(400).json({
          ok: false,
          error: "Missing required fields: requestId, discordId, username",
        });
      }

      // Post message to Discord
      const result = await postLinkRequestMessage(client, {
        requestId,
        discordId,
        username,
      });

      res.json({
        ok: true,
        messageId: result.messageId,
      });
    } catch (error: unknown) {
      logError("link_request_post_endpoint_error", error, {
        endpoint: "/api/worker/link-request/post",
      });
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : "Failed to post link request",
      });
    }
  });

  /**
   * POST /internal/discord/postMessage
   * Secure internal endpoint to send a Discord message
   *
   * Headers:
   * - x-ingest-secret: INGEST_SECRET
   *
   * Body:
   * {
   *   channelId: string,
   *   content?: string,
   *   embeds?: any[]
   * }
   */
  app.post("/internal/discord/postMessage", async (req: Request, res: Response) => {
    try {
      const xSecret = req.headers["x-ingest-secret"] as string;
      const isValidXSecret = WORKER_SECRET && xSecret === WORKER_SECRET;

      if (!WORKER_SECRET) {
        // ✅ MEGA PATCH #3: Check both INGEST_SECRET and DISCORD_WORKER_SECRET env vars
        const hasIngestSecret = !!process.env.INGEST_SECRET;
        const hasWorkerSecret = !!process.env.DISCORD_WORKER_SECRET;
        logError("post_message_auth_error", 
          `Worker secret not configured (INGEST_SECRET: ${hasIngestSecret}, DISCORD_WORKER_SECRET: ${hasWorkerSecret})`
        );
        return res.status(401).json({ ok: false, error: "Server not configured" });
      }

      if (!isValidXSecret) {
        logError("post_message_auth_error", "Invalid or missing secret", {
          provided: xSecret ? "yes" : "no",
        });
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }

      const { channelId, content, embeds } = req.body ?? {};

      log("internal_post_message_attempt", {
        channelId,
        hasContent: !!content,
        embedCount: embeds?.length ?? 0,
      });

      if (!channelId || (typeof content !== "string" && !Array.isArray(embeds))) {
        logError("post_message_validation_error", "Missing channelId or content/embeds", {
          channelId: !!channelId,
          hasContent: typeof content === "string",
          hasEmbeds: Array.isArray(embeds),
        });
        return res.status(400).json({
          ok: false,
          error: "Missing channelId or content/embeds",
        });
      }

      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased() || channel.isDMBased()) {
        logError("post_message_channel_error", "Channel not found or not text-based", {
          channelId,
          found: !!channel,
          isTextBased: channel?.isTextBased?.(),
          isDMBased: channel?.isDMBased?.(),
        });
        return res.status(404).json({
          ok: false,
          error: "Channel not found or not text-based",
        });
      }

      const message = await channel.send({
        content: typeof content === "string" ? content : undefined,
        embeds: Array.isArray(embeds) ? embeds : undefined,
      });

      log("internal_post_message_success", {
        channelId,
        messageId: message.id,
      });

      res.json({ ok: true, messageId: message.id });
    } catch (error: unknown) {
      logError("post_message_endpoint_error", error, {
        endpoint: "/internal/discord/postMessage",
      });
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : "Failed to post message",
      });
    }
  });

  /**
   * POST /internal/discord/rename
   * Secure internal endpoint to rename a Discord member
   *
   * Headers:
   * - x-ingest-secret: INGEST_SECRET
   *
   * Body:
   * {
   *   discordId: string,
   *   rpName: string | null,
   *   reason?: string
   * }
   */
  app.post("/internal/discord/rename", async (req: Request, res: Response) => {
    try {
      const xSecret = req.headers["x-ingest-secret"] as string;
      const isValidXSecret = WORKER_SECRET && xSecret === WORKER_SECRET;

      if (!WORKER_SECRET) {
        // ✅ MEGA PATCH #3: Check both INGEST_SECRET and DISCORD_WORKER_SECRET env vars
        const hasIngestSecret = !!process.env.INGEST_SECRET;
        const hasWorkerSecret = !!process.env.DISCORD_WORKER_SECRET;
        logError("rename_auth_error", 
          `Worker secret not configured (INGEST_SECRET: ${hasIngestSecret}, DISCORD_WORKER_SECRET: ${hasWorkerSecret})`
        );
        return res.status(401).json({ ok: false, error: "Server not configured" });
      }

      if (!isValidXSecret) {
        logError("rename_auth_error", "Invalid or missing secret", {
          provided: xSecret ? "yes" : "no",
        });
        return res.status(401).json({ ok: false, error: "Unauthorized" });
      }

      const { discordId, rpName, reason } = req.body ?? {};

      log("rename_attempt", {
        discordId,
        hasRpName: !!rpName,
      });

      if (!discordId || typeof discordId !== "string") {
        logError("rename_validation_error", "Missing or invalid discordId", {
          discordId: !!discordId,
        });
        return res.status(400).json({
          ok: false,
          error: "Missing or invalid discordId",
        });
      }

      // Check rate limit
      if (!checkRenameRateLimit(discordId)) {
        logError("rename_rate_limit", "Too many rename attempts", {
          discordId,
          limit: RENAME_RATE_LIMIT_MAX,
          windowMs: RENAME_RATE_LIMIT_WINDOW_MS,
        });
        return res.status(429).json({
          ok: false,
          error: `Rate limit exceeded: max ${RENAME_RATE_LIMIT_MAX} renames per ${RENAME_RATE_LIMIT_WINDOW_MS / 1000}s`,
        });
      }

      // Get guild ID from environment
      const guildId = process.env.DISCORD_GUILD_ID || process.env.GUILD_ID;
      if (!guildId) {
        logError("rename_config_error", "DISCORD_GUILD_ID not configured");
        return res.status(500).json({
          ok: false,
          error: "Server not configured (missing DISCORD_GUILD_ID)",
        });
      }

      // Attempt rename
      const result = await renameMemberIfPossible(
        client,
        guildId,
        discordId,
        rpName,
        reason
      );

      log("rename_result", {
        discordId,
        ok: result.ok,
        skipped: result.skipped,
        nickname: result.nickname,
        error: result.error,
      });

      if (!result.ok) {
        return res.status(result.skipped ? 400 : 500).json({
          ok: false,
          error: result.error || "Failed to rename",
          skipped: result.skipped,
        });
      }

      res.json({
        ok: true,
        nickname: result.nickname,
        skipped: result.skipped,
      });
    } catch (error: unknown) {
      logError("rename_endpoint_error", error, {
        endpoint: "/internal/discord/rename",
      });
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : "Failed to rename member",
      });
    }
  });

  // Global error handler (last middleware)
  app.use((err: unknown, req: Request, res: Response, next: () => void) => {
    const message = err instanceof Error ? err.message : String(err);
    logError("http_server_error", err, { path: req.path });
    res.status(500).json({ ok: false, error: message });
    next();
  });

  return {
    start: async () => {
      return new Promise((resolve, reject) => {
        try {
          server = app!.listen(PORT, () => {
            log("worker_http_server_started", { port: PORT });
            resolve();
          });
          server.on("error", (error: any) => {
            if (error.code === "EADDRINUSE") {
              // Port is already in use - log warning but don't crash
              logError("worker_http_server_port_in_use", error, { port: PORT, action: "skipping_http_server" });
              // Don't reject - HTTP server is optional
              resolve();
            } else {
              logError("worker_http_server_error", error);
              reject(error);
            }
          });
        } catch (error) {
          logError("worker_http_server_init_error", error);
          reject(error);
        }
      });
    },
    stop: async () => {
      return new Promise((resolve) => {
        if (server) {
          server.close(() => {
            log("worker_http_server_stopped");
            resolve();
          });
        } else {
          resolve();
        }
      });
    },
  };
}
