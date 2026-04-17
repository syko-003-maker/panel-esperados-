import { prisma } from "@/lib/db";
import { runWithConcurrency } from "@/lib/run-with-concurrency";
import { createDelay } from "@/lib/utils/delay";
import { debug, warn, error as logError } from "@/lib/logger";

const DISCORD_TOKEN = (process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN ?? "").trim();
const GUILD_ID = (process.env.GUILD_ID ?? process.env.DISCORD_GUILD_ID ?? "").trim();

const DEFAULT_CONCURRENCY = Number(process.env.DISCORD_SNAPSHOT_CONCURRENCY ?? "3");
const MAX_RETRIES = 4;
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30000;

let globalBackoffUntil = 0;

type DiscordFetchResult =
  | { ok: true; inGuild: boolean; roles: string[]; username: string | null; nickname: string | null }
  | { ok: false; errorCode: "RATE_LIMIT" | "UNAVAILABLE" | "CONFIG_MISSING" };

async function fetchDiscordMember(discordId: string, attempt = 0): Promise<DiscordFetchResult> {
  if (!DISCORD_TOKEN || !GUILD_ID) {
    return { ok: false, errorCode: "CONFIG_MISSING" };
  }

  const now = Date.now();
  if (globalBackoffUntil > now) {
    await createDelay(globalBackoffUntil - now);
  }

  const url = `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordId}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bot ${DISCORD_TOKEN}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 404) {
      return { ok: true, inGuild: false, roles: [], username: null, nickname: null };
    }

    if (res.status === 429) {
      const retryAfter = res.headers.get("Retry-After");
      const retryAfterMs = retryAfter
        ? Math.floor(Number(retryAfter) * 1000)
        : BACKOFF_BASE_MS * Math.pow(2, Math.min(attempt, 4));

      const waitMs = Math.min(retryAfterMs, BACKOFF_MAX_MS);
      globalBackoffUntil = Date.now() + waitMs;

      warn("[discord-snapshot] 429 rate limit", { discordId, attempt, waitMs });

      if (attempt < MAX_RETRIES) {
        await createDelay(waitMs);
        return fetchDiscordMember(discordId, attempt + 1);
      }

      return { ok: false, errorCode: "RATE_LIMIT" };
    }

    if (!res.ok) {
      warn("[discord-snapshot] API error", { discordId, status: res.status });
      return { ok: false, errorCode: "UNAVAILABLE" };
    }

    const payload = (await res.json()) as {
      roles?: string[];
      nick?: string | null;
      user?: { username?: string | null; global_name?: string | null };
    };

    const roles = Array.isArray(payload.roles) ? payload.roles : [];
    const nickname = payload.nick ?? null;
    const username = payload.user?.global_name ?? payload.user?.username ?? null;

    return { ok: true, inGuild: true, roles, username, nickname };
  } catch (err: any) {
    logError("[discord-snapshot] Fetch failed", {
      discordId,
      error: err?.message ?? String(err),
    });

    if (attempt < MAX_RETRIES) {
      const waitMs = Math.min(BACKOFF_BASE_MS * Math.pow(2, attempt), BACKOFF_MAX_MS);
      await createDelay(waitMs);
      return fetchDiscordMember(discordId, attempt + 1);
    }

    return { ok: false, errorCode: "UNAVAILABLE" };
  }
}

export type DiscordSnapshotSyncResult = {
  total: number;
  success: number;
  notFound: number;
  rateLimited: number;
  errors: number;
  updatedSnapshots: number;
  createdSnapshots: number;
  skippedNoSnapshot: number;
  durationMs: number;
};

export async function runDiscordSnapshotResync(source: "cron" | "event" | "manual"): Promise<DiscordSnapshotSyncResult> {
  const startTime = Date.now();
  debug("[discord-snapshot] Resync started", { source });

  const members = await prisma.member.findMany({
    where: { discordId: { not: null } },
    select: {
      id: true,
      discordId: true,
      discordSnapshot: { select: { id: true } },
    },
  });

  const concurrency = Number.isFinite(DEFAULT_CONCURRENCY) && DEFAULT_CONCURRENCY > 0
    ? DEFAULT_CONCURRENCY
    : 3;

  const counters = {
    success: 0,
    notFound: 0,
    rateLimited: 0,
    errors: 0,
    updatedSnapshots: 0,
    createdSnapshots: 0,
    skippedNoSnapshot: 0,
  };

  await runWithConcurrency(
    members,
    async (member) => {
      const discordId = member.discordId?.trim();
      if (!discordId) return null;

      const result = await fetchDiscordMember(discordId);
      const now = new Date();

      if (result.ok) {
        const rolesJson = { roles: result.roles };

        if (member.discordSnapshot?.id) {
          await prisma.memberDiscordSnapshot.update({
            where: { memberId: member.id },
            data: {
              discordId,
              isInGuild: result.inGuild,
              rolesJson,
              nickname: result.nickname,
              username: result.username,
              lastCheckedAt: now,
              lastSuccessAt: now,
              lastError: null,
              source,
              updatedAt: now,
            },
          });
          counters.updatedSnapshots += 1;
        } else {
          await prisma.memberDiscordSnapshot.create({
            data: {
              memberId: member.id,
              discordId,
              isInGuild: result.inGuild,
              rolesJson,
              nickname: result.nickname,
              username: result.username,
              lastCheckedAt: now,
              lastSuccessAt: now,
              lastError: null,
              source,
              updatedAt: now,
            },
          });
          counters.createdSnapshots += 1;
        }

        await prisma.member.update({
          where: { id: member.id },
          data: {
            discordInGuild: result.inGuild,
            discordRoleIds: result.inGuild ? result.roles : [],
            discordRolesUpdatedAt: now,
            discordLastError: null,
          },
        });

        if (result.inGuild) {
          counters.success += 1;
        } else {
          counters.notFound += 1;
        }
      } else {
        if (result.errorCode === "RATE_LIMIT") {
          counters.rateLimited += 1;
        } else {
          counters.errors += 1;
        }

        if (member.discordSnapshot?.id) {
          await prisma.memberDiscordSnapshot.update({
            where: { memberId: member.id },
            data: {
              lastCheckedAt: now,
              lastError: result.errorCode,
              source,
              updatedAt: now,
            },
          });
          counters.updatedSnapshots += 1;
        } else {
          counters.skippedNoSnapshot += 1;
        }
      }

      return null;
    },
    { concurrency }
  );

  const durationMs = Date.now() - startTime;

  debug("[discord-snapshot] Resync finished", {
    source,
    total: members.length,
    durationMs,
    ...counters,
  });

  return {
    total: members.length,
    durationMs,
    ...counters,
  };
}
