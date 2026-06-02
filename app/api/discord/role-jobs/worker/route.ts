/**
 * Discord Role Job Processor
 * Purpose: Apply/remove roles in asynchronous queue (prevents 429 spam)
 * 
 * How it works:
 * 1. Fetch PENDING jobs where `runAt <= now()`
 * 2. Apply roles with batching + backoff
 * 3. Update job status (SUCCEEDED | FAILED)
 * 4. Refresh DiscordSnapshot on success
 * 
 * Trigger: Cron job OR manual webhook
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { debug, warn, error as logError } from "@/lib/logger";
import { createDelay } from "@/lib/utils/delay";

const DISCORD_TOKEN = (process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN ?? "").trim();
const GUILD_ID = (process.env.GUILD_ID ?? process.env.DISCORD_GUILD_ID ?? "").trim();
const WORKER_SECRET = (process.env.DISCORD_WORKER_SECRET ?? "").trim();

const BATCH_SIZE = 10; // Process 10 jobs at a time
const CONCURRENCY = 2; // Max 2 concurrent API calls
const BACKOFF_BASE_MS = 2000;
const MAX_BACKOFF_MS = 60000;

type JobPayload = {
  roles?: string[]; // For APPLY_ROLES / REMOVE_ROLES
  reason?: string;
};

async function updateMemberDiscordMirror(params: {
  discordId: string;
  inGuild: boolean;
  roles?: string[];
}) {
  const now = new Date();
  await prisma.member.updateMany({
    where: { discordId: params.discordId },
    data: {
      discordInGuild: params.inGuild,
      discordRoleIds: params.inGuild ? (params.roles ?? []) : [],
      discordRolesUpdatedAt: now,
      discordLastError: null,
    },
  });
}

async function applyRoles(
  discordId: string,
  guildId: string,
  rolesToAdd: string[],
  reason: string,
  retryCount = 0
): Promise<{ ok: boolean; errorCode?: string }> {
  if (!DISCORD_TOKEN) {
    return { ok: false, errorCode: "CONFIG_MISSING" };
  }

  // Apply each role individually (Discord API requires per-role PUT)
  const results = await Promise.allSettled(
    rolesToAdd.map(async (roleId) => {
      const url = `https://discord.com/api/v10/guilds/${guildId}/members/${discordId}/roles/${roleId}`;
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          Authorization: `Bot ${DISCORD_TOKEN}`,
          "X-Audit-Log-Reason": reason ?? "Role application via panel-esperados",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After");
        const retryAfterMs = retryAfter
          ? parseInt(retryAfter) * 1000
          : BACKOFF_BASE_MS * Math.pow(2, Math.min(retryCount, 4));

        warn("[discord-worker] 429 Rate limit", {
          discordId,
          roleId,
          retryAfter,
          retryCount,
        });

        if (retryCount < 3) {
          await createDelay(Math.min(retryAfterMs, MAX_BACKOFF_MS));
          return applyRoles(discordId, guildId, [roleId], reason, retryCount + 1);
        }

        throw new Error(`429 rate limit after ${retryCount} retries`);
      }

      if (!res.ok && res.status !== 204) {
        throw new Error(`Failed to apply role ${roleId}: HTTP ${res.status}`);
      }

      return { ok: true, roleId };
    })
  );

  // Check if any failed
  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    logError("[discord-worker] Some roles failed to apply", {
      discordId,
      totalRoles: rolesToAdd.length,
      failures: failures.length,
    });
    return {
      ok: false,
      errorCode: "PARTIAL_FAILURE",
    };
  }

  return { ok: true };
}

async function removeRoles(
  discordId: string,
  guildId: string,
  rolesToRemove: string[],
  reason: string,
  retryCount = 0
): Promise<{ ok: boolean; errorCode?: string }> {
  if (!DISCORD_TOKEN) {
    return { ok: false, errorCode: "CONFIG_MISSING" };
  }

  const results = await Promise.allSettled(
    rolesToRemove.map(async (roleId) => {
      const url = `https://discord.com/api/v10/guilds/${guildId}/members/${discordId}/roles/${roleId}`;
      const res = await fetch(url, {
        method: "DELETE",
        headers: {
          Authorization: `Bot ${DISCORD_TOKEN}`,
          "X-Audit-Log-Reason": reason ?? "Role removal via panel-esperados",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After");
        const retryAfterMs = retryAfter
          ? parseInt(retryAfter) * 1000
          : BACKOFF_BASE_MS * Math.pow(2, Math.min(retryCount, 4));

        warn("[discord-worker] 429 Rate limit", {
          discordId,
          roleId,
          retryAfter,
          retryCount,
        });

        if (retryCount < 3) {
          await createDelay(Math.min(retryAfterMs, MAX_BACKOFF_MS));
          return removeRoles(discordId, guildId, [roleId], reason, retryCount + 1);
        }

        throw new Error(`429 rate limit after ${retryCount} retries`);
      }

      if (!res.ok && res.status !== 204 && res.status !== 404) {
        // 404 = role already removed, which is OK
        throw new Error(`Failed to remove role ${roleId}: HTTP ${res.status}`);
      }

      return { ok: true, roleId };
    })
  );

  const failures = results.filter((r) => r.status === "rejected");
  if (failures.length > 0) {
    logError("[discord-worker] Some roles failed to remove", {
      discordId,
      totalRoles: rolesToRemove.length,
      failures: failures.length,
    });
    return {
      ok: false,
      errorCode: "PARTIAL_FAILURE",
    };
  }

  return { ok: true };
}

async function syncMemberStatus(
  discordId: string,
  guildId: string
): Promise<{ ok: boolean; inGuild?: boolean; roles?: string[]; errorCode?: string }> {
  if (!DISCORD_TOKEN) {
    return { ok: false, errorCode: "CONFIG_MISSING" };
  }

  const url = `https://discord.com/api/v10/guilds/${guildId}/members/${discordId}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bot ${DISCORD_TOKEN}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 404) {
      return { ok: true, inGuild: false, roles: [] };
    }

    if (res.status === 429) {
      return { ok: false, errorCode: "RATE_LIMIT" };
    }

    if (!res.ok) {
      return { ok: false, errorCode: "UNAVAILABLE" };
    }

    const member = (await res.json()) as { roles?: string[] };
    return {
      ok: true,
      inGuild: true,
      roles: member.roles || [],
    };
  } catch (err) {
    logError("[discord-worker] Sync error", {
      discordId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, errorCode: "UNAVAILABLE" };
  }
}

async function processJob(jobId: number) {
  const job = await prisma.discordRoleJob.findUnique({
    where: { id: jobId },
  });

  if (!job || job.status !== "PENDING") {
    debug("[discord-worker] Job not processable", { jobId, status: job?.status });
    return;
  }

  // Mark as RUNNING
  await prisma.discordRoleJob.update({
    where: { id: jobId },
    data: { status: "RUNNING" },
  });

  const payload = job.payload as JobPayload;
  const discordId = job.discordId;
  const guildId = job.guildId;

  let result: { ok: boolean; errorCode?: string; inGuild?: boolean; roles?: string[] } = {
    ok: false,
    errorCode: "UNKNOWN",
  };

  try {
    if (job.type === "APPLY_ROLES") {
      const rolesToAdd = payload.roles || [];
      result = await applyRoles(discordId, guildId, rolesToAdd, payload.reason || "");
    } else if (job.type === "REMOVE_ROLES") {
      const rolesToRemove = payload.roles || [];
      result = await removeRoles(discordId, guildId, rolesToRemove, payload.reason || "");
    } else if (job.type === "SYNC_MEMBER") {
      result = await syncMemberStatus(discordId, guildId);
    }

    if (result.ok) {
      // Mark as SUCCEEDED
      await prisma.discordRoleJob.update({
        where: { id: jobId },
        data: {
          status: "SUCCEEDED",
          executedAt: new Date(),
        },
      });

      // Refresh DiscordSnapshot if we have fresh data
      if (job.type === "SYNC_MEMBER" && result.inGuild !== undefined) {
        await updateMemberDiscordMirror({
          discordId,
          inGuild: result.inGuild,
          roles: result.roles || [],
        });

        await prisma.discordSnapshot.upsert({
          where: { discordId },
          create: {
            discordId,
            inGuild: result.inGuild,
            roles: result.roles || [],
            source: "live",
            lastOkAt: new Date(),
          },
          update: {
            inGuild: result.inGuild,
            roles: result.roles || [],
            fetchedAt: new Date(),
            source: "live",
            lastOkAt: new Date(),
          },
        });
      }

      debug("[discord-worker] Job succeeded", { jobId, type: job.type, discordId });
    } else {
      // Mark as FAILED
      const attempts = job.attempts + 1;
      const shouldRetry = attempts < job.maxAttempts;

      await prisma.discordRoleJob.update({
        where: { id: jobId },
        data: {
          status: shouldRetry ? "PENDING" : "FAILED",
          attempts,
          lastError: result.errorCode || "UNKNOWN",
          runAt: shouldRetry ? new Date(Date.now() + BACKOFF_BASE_MS * Math.pow(2, attempts)) : undefined,
        },
      });

      warn("[discord-worker] Job failed", {
        jobId,
        type: job.type,
        discordId,
        errorCode: result.errorCode,
        attempts,
        willRetry: shouldRetry,
      });
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const attempts = job.attempts + 1;
    const shouldRetry = attempts < job.maxAttempts;

    await prisma.discordRoleJob.update({
      where: { id: jobId },
      data: {
        status: shouldRetry ? "PENDING" : "FAILED",
        attempts,
        lastError: errMsg,
        runAt: shouldRetry ? new Date(Date.now() + BACKOFF_BASE_MS * Math.pow(2, attempts)) : undefined,
      },
    });

    logError("[discord-worker] Job exception", {
      jobId,
      type: job.type,
      discordId,
      error: errMsg,
      attempts,
      willRetry: shouldRetry,
    });
  }
}

export async function POST(req: Request) {
  // Secret via header UNIQUEMENT (jamais en query : fuite dans les logs/proxy).
  const secret = req.headers.get("x-worker-secret");

  // Fail-closed : refuser si secret non configuré OU mismatch
  if (!WORKER_SECRET || secret !== WORKER_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  debug("[discord-worker] Starting batch processing...");

  // Fetch PENDING jobs ready to run
  const jobs = await prisma.discordRoleJob.findMany({
    where: {
      status: "PENDING",
      runAt: { lte: new Date() },
    },
    take: BATCH_SIZE,
    orderBy: { runAt: "asc" },
  });

  if (jobs.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 }, { status: 200 });
  }

  debug("[discord-worker] Processing jobs", { count: jobs.length });

  // Process jobs with concurrency limit
  const chunks: number[][] = [];
  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    chunks.push(jobs.slice(i, i + CONCURRENCY).map((j) => j.id));
  }

  for (const chunk of chunks) {
    await Promise.allSettled(chunk.map((jobId: number) => processJob(jobId)));
  }

  debug("[discord-worker] Batch complete", { count: jobs.length });

  return NextResponse.json({ ok: true, processed: jobs.length }, { status: 200 });
}
