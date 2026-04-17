import { NextRequest, NextResponse } from "next/server";
import { runDiscordSnapshotResync } from "@/lib/discord-snapshot-sync";
import { logger } from "@/lib/logger";

/**
 * Cron endpoint for Discord snapshot resync
 * Protected by CRON_SECRET header
 * Recommended schedule: every 60 minutes
 */
export async function POST(req: NextRequest) {
  try {
    // Verify CRON_SECRET
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      logger.warn("discord-sync-cron", "CRON_SECRET not configured");
      return NextResponse.json(
        { error: "CRON_SECRET not configured" },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      logger.warn("discord-sync-cron", "Unauthorized cron request");
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    logger.info("discord-sync-cron", "Starting Discord snapshot resync");

    const result = await runDiscordSnapshotResync("cron");

    logger.info("discord-sync-cron", "Completed Discord snapshot resync", {
      ...result,
    });

    return NextResponse.json({
      status: "success",
      message: "Discord snapshot resync completed",
      ...result,
    });
  } catch (error) {
    logger.error(
      "discord-sync-cron",
      `Fatal error: ${error instanceof Error ? error.message : String(error)}`
    );
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Health check endpoint (GET)
 */
export async function GET(req: NextRequest) {
  return NextResponse.json({
    status: "ok",
    message: "Discord snapshot cron endpoint ready",
    nextRun: "Every 60 minutes (configured in vercel.json)",
  });
}
