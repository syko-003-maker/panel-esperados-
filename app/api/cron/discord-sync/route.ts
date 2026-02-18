import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { batchFetchDiscordMembers } from "@/lib/discord-batch-reliable";
import { logger } from "@/lib/logger";
import { runWithConcurrency } from "@/lib/run-with-concurrency";

/**
 * Cron endpoint for automatic Discord member status sync
 * Protected by CRON_SECRET header
 * Run every 30 minutes via Vercel Crons or external scheduler
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

    const startTime = Date.now();
    logger.info("discord-sync-cron", "Starting Discord member status sync");

    // 1. Fetch all members with Discord IDs
    const membersWithDiscordId = await prisma.member.findMany({
      where: {
        discordId: {
          not: null,
        },
      },
      select: {
        id: true,
        discordId: true,
      },
    });

    if (membersWithDiscordId.length === 0) {
      logger.info("discord-sync-cron", "No members with Discord IDs found");
      return NextResponse.json({
        status: "success",
        message: "No members to sync",
        totalMembers: 0,
        synced: 0,
        durationMs: Date.now() - startTime,
      });
    }

    logger.info(
      "discord-sync-cron",
      `Found ${membersWithDiscordId.length} members to sync`
    );

    // 2. Batch by 50 members (to avoid overwhelming Discord API + LYG rate limits)
    const batchSize = 50;
    const batches: string[][] = [];
    for (let i = 0; i < membersWithDiscordId.length; i += batchSize) {
      batches.push(
        membersWithDiscordId
          .slice(i, i + batchSize)
          .map((m) => m.discordId!)
      );
    }

    logger.info(
      "discord-sync-cron",
      `Processing ${batches.length} batches of ${batchSize} members`
    );

    // 3. Process batches with concurrency control to avoid rate limits
    const batchResults = await runWithConcurrency(
      batches,
      async (discordIds) => {
        try {
          logger.info(
            "discord-sync-cron",
            `Fetching status for ${discordIds.length} members`
          );

          const statuses = await batchFetchDiscordMembers(discordIds);

          // Update members in DB
          await Promise.all(
            discordIds.map(async (discordId) => {
              const status = statuses[discordId];
              if (!status) {
                return null;
              }

              return prisma.member.updateMany({
                where: { discordId },
                data: {
                  discordInGuild: status.inGuild,
                  discordRoleIds: status.inGuild ? status.roles ?? [] : [],
                  discordRolesUpdatedAt: new Date(),
                },
              });
            })
          );

          logger.info(
            "discord-sync-cron",
            `Synced ${discordIds.length} members`
          );

          return { success: true, synced: discordIds.length };
        } catch (error) {
          logger.error(
            "discord-sync-cron",
            `Error processing batch: ${error instanceof Error ? error.message : String(error)}`
          );
          return { success: false, synced: 0, error: String(error) };
        }
      },
      { concurrency: 2 } // Reduced concurrency to respect rate limits
    );

    // Tally results across all batches
    const totalSynced = batchResults.reduce((sum, r) => sum + r.synced, 0);
    const totalErrors = batchResults.filter((r) => !r.success).length;

    const durationMs = Date.now() - startTime;

    logger.info(
      "discord-sync-cron",
      `Completed in ${durationMs}ms. Synced: ${totalSynced}/${membersWithDiscordId.length}, Errors: ${totalErrors}`
    );

    return NextResponse.json({
      status: "success",
      message: "Discord sync completed",
      totalMembers: membersWithDiscordId.length,
      synced: totalSynced,
      errors: totalErrors,
      batches: batches.length,
      durationMs,
      timestamp: new Date().toISOString(),
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
    message: "Discord sync cron endpoint ready",
    nextRun: "Every 30 minutes (configured in vercel.json)",
  });
}
