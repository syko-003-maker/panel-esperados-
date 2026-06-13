/**
 * Discord Full Resync Endpoint
 * Purpose: Paginate Discord guild members and mirror state to DB
 * 
 * This prevents 429 spam by:
 * - Running as background job (not per page load)
 * - Using pagination (1000 members per batch)
 * - Respecting rate limits with backoff
 * - Updating Member.discordInGuild + discordRoleIds in DB
 * 
 * Trigger: POST /api/discord/resync?secret=DISCORD_WORKER_SECRET
 * Or: Manual admin action
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { debug, warn, error as logError } from "@/lib/logger";
import { createDelay } from "@/lib/utils/delay";

const DISCORD_TOKEN = (process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN ?? "").trim();
const GUILD_ID = (process.env.GUILD_ID ?? process.env.DISCORD_GUILD_ID ?? "").trim();
const WORKER_SECRET = (process.env.DISCORD_WORKER_SECRET ?? "").trim();

const BATCH_SIZE = 1000; // Discord API max
const BACKOFF_BASE_MS = 2000;
const MAX_BACKOFF_MS = 60000;

// In-memory lock to prevent concurrent resyncs
let resyncLock = false;
let lastResyncAt = 0;
const RESYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

type DiscordGuildMember = {
  user?: { id: string };
  roles?: string[];
};

async function fetchGuildMembersPage(
  after?: string,
  retryCount = 0
): Promise<{ members: DiscordGuildMember[]; hasMore: boolean; lastId?: string }> {
  if (!DISCORD_TOKEN || !GUILD_ID) {
    throw new Error("Discord config missing");
  }

  let url = `https://discord.com/api/v10/guilds/${GUILD_ID}/members?limit=${BATCH_SIZE}`;
  if (after) {
    url += `&after=${after}`;
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bot ${DISCORD_TOKEN}`,
      },
      signal: AbortSignal.timeout(30000),
    });

    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After");
      const retryAfterMs = retryAfter
        ? parseInt(retryAfter) * 1000
        : BACKOFF_BASE_MS * Math.pow(2, Math.min(retryCount, 5));

      warn("[discord-resync] 429 Rate limit", { retryAfter, retryCount, after });

      if (retryCount < 5) {
        await createDelay(Math.min(retryAfterMs, MAX_BACKOFF_MS));
        return fetchGuildMembersPage(after, retryCount + 1);
      }

      throw new Error(`429 rate limit after ${retryCount} retries`);
    }

    if (!res.ok) {
      throw new Error(`Discord API error: HTTP ${res.status}`);
    }

    const members = (await res.json()) as DiscordGuildMember[];
    const hasMore = members.length >= BATCH_SIZE;
    const lastId = hasMore && members.length > 0 ? members[members.length - 1].user?.id : undefined;

    return { members, hasMore, lastId };
  } catch (err) {
    logError("[discord-resync] Fetch error", {
      error: err instanceof Error ? err.message : String(err),
      after,
      retryCount,
    });
    throw err;
  }
}

async function resyncAllMembers(): Promise<{ synced: number; errors: number }> {
  debug("[discord-resync] Starting full resync...");

  const seenDiscordIds = new Set<string>();
  let totalSynced = 0;
  let totalErrors = 0;
  let after: string | undefined = undefined;

  try {
    // Paginate through all guild members
    while (true) {
      const { members, hasMore, lastId } = await fetchGuildMembersPage(after);

      debug("[discord-resync] Fetched page", {
        count: members.length,
        hasMore,
        after,
      });

      // Update DB for each member
      for (const guildMember of members) {
        const discordId = guildMember.user?.id;
        if (!discordId) continue;

        seenDiscordIds.add(discordId);

        try {
          const roles = guildMember.roles || [];

          await prisma.member.updateMany({
            where: { discordId },
            data: {
              discordInGuild: true,
              discordRoleIds: roles,
              discordRolesUpdatedAt: new Date(),
              discordLastError: null,
            },
          });

          totalSynced++;
        } catch (err) {
          totalErrors++;
          logError("[discord-resync] Failed to update member", {
            discordId,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (!hasMore || !lastId) break;
      after = lastId;

      // Small delay between pages to avoid rate limits
      await createDelay(500);
    }

    // Mark members NOT seen as no longer in guild (but only if we got a full list)
    if (totalErrors === 0 && seenDiscordIds.size > 0) {
      debug("[discord-resync] Marking absent members", {
        seenCount: seenDiscordIds.size,
      });

      const allMembersWithDiscord = await prisma.member.findMany({
        where: {
          discordId: { not: null },
        },
        select: { id: true, discordId: true },
      });

      for (const member of allMembersWithDiscord) {
        if (member.discordId && !seenDiscordIds.has(member.discordId)) {
          try {
            await prisma.member.update({
              where: { id: member.id },
              data: {
                discordInGuild: false,
                discordRoleIds: [],
                discordRolesUpdatedAt: new Date(),
              },
            });
          } catch (err) {
            logError("[discord-resync] Failed to mark absent", {
              memberId: member.id,
              discordId: member.discordId,
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      }
    }

    debug("[discord-resync] Resync complete", {
      synced: totalSynced,
      errors: totalErrors,
      seenDiscordIds: seenDiscordIds.size,
    });

    return { synced: totalSynced, errors: totalErrors };
  } catch (err) {
    logError("[discord-resync] Resync failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

export async function POST(req: Request) {
  // Secret via header uniquement (jamais en query : ça fuite dans les logs).
  const secret = req.headers.get("x-worker-secret");

  // ⚠️ SÉCURITÉ : fail-closed. Si DISCORD_WORKER_SECRET n'est pas configuré,
  // on REFUSE tout (avant, `if (WORKER_SECRET && …)` laissait passer sans
  // secret → resync complet de la guilde accessible sans authentification).
  if (!WORKER_SECRET || secret !== WORKER_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check lock
  const now = Date.now();
  if (resyncLock) {
    return NextResponse.json(
      { error: "Resync already in progress", lastResyncAt },
      { status: 409 }
    );
  }

  if (now - lastResyncAt < RESYNC_COOLDOWN_MS) {
    return NextResponse.json(
      {
        error: "Resync cooldown active",
        lastResyncAt,
        cooldownRemaining: RESYNC_COOLDOWN_MS - (now - lastResyncAt),
      },
      { status: 429 }
    );
  }

  // Acquire lock
  resyncLock = true;
  lastResyncAt = now;

  try {
    const result = await resyncAllMembers();

    return NextResponse.json(
      {
        ok: true,
        synced: result.synced,
        errors: result.errors,
        completedAt: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  } finally {
    // Release lock
    resyncLock = false;
  }
}

export async function GET(req: Request) {
  // Get resync status — réservé au worker (même secret que le POST).
  const secret = req.headers.get("x-worker-secret");
  if (!WORKER_SECRET || secret !== WORKER_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    locked: resyncLock,
    lastResyncAt,
    cooldownRemaining: Math.max(0, RESYNC_COOLDOWN_MS - (Date.now() - lastResyncAt)),
  });
}
