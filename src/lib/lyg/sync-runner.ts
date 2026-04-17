import { prisma } from "@/lib/db";
import { acquireSyncTypeLock, releaseSyncTypeLock } from "@/lib/lyg/lock";
import { isRateLimitError, nextBackoffMs } from "@/lib/lyg/rate-limit";

export type SyncType = "members" | "banklogs" | "infos" | "playtime";
export type SyncSource = "manual" | "cron";

export type ControlledSyncResult<TMetrics extends Record<string, unknown>> = {
  ok: boolean;
  type: SyncType;
  source: SyncSource;
  reason?: string;
  backoffMs?: number;
  durationMs: number;
  metrics?: TMetrics;
};

type RunnerInput<TMetrics extends Record<string, unknown>> = {
  type: SyncType;
  source: SyncSource;
  familyId: string;
  minIntervalMs?: number;
  lockTtlMs?: number;
  run: () => Promise<TMetrics>;
};

export async function runControlledLygSync<TMetrics extends Record<string, unknown>>(
  input: RunnerInput<TMetrics>
): Promise<ControlledSyncResult<TMetrics>> {
  const startedAt = Date.now();
  const syncKey = `lyg-sync:${input.type}:${input.familyId}`;
  const minIntervalMs = input.minIntervalMs ?? 60_000;

  const syncState = await prisma.syncState.findUnique({ where: { key: syncKey } });
  const meta = (syncState?.meta as Record<string, any>) ?? {};
  const now = new Date();

  const lastAttemptAt = meta.lastAttemptAt ? new Date(meta.lastAttemptAt) : null;
  if (lastAttemptAt && now.getTime() - lastAttemptAt.getTime() < minIntervalMs) {
    console.log("[LYG_SYNC][RUNNER] skip_rate_limit", {
      type: input.type,
      source: input.source,
      familyId: input.familyId,
    });
    return {
      ok: true,
      type: input.type,
      source: input.source,
      reason: "RATE_LIMIT",
      durationMs: Date.now() - startedAt,
    };
  }

  const backoffUntil = meta.backoffUntil ? new Date(meta.backoffUntil) : null;
  if (backoffUntil && backoffUntil > now) {
    const waitMs = Math.max(0, backoffUntil.getTime() - now.getTime());
    console.log("[LYG_SYNC][RUNNER] skip_backoff", {
      type: input.type,
      source: input.source,
      familyId: input.familyId,
      backoffUntil: backoffUntil.toISOString(),
      waitMs,
    });
    return {
      ok: true,
      type: input.type,
      source: input.source,
      reason: "BACKOFF",
      backoffMs: waitMs,
      durationMs: Date.now() - startedAt,
    };
  }

  const lock = await acquireSyncTypeLock(input.type, input.familyId, input.lockTtlMs ?? 60_000);
  if (!lock) {
    console.log("[LYG_SYNC][RUNNER] skip_locked", {
      type: input.type,
      source: input.source,
      familyId: input.familyId,
    });
    return {
      ok: true,
      type: input.type,
      source: input.source,
      reason: "LOCKED",
      durationMs: Date.now() - startedAt,
    };
  }

  try {
    console.log("[LYG_SYNC][RUNNER] start", {
      type: input.type,
      source: input.source,
      familyId: input.familyId,
    });

    const metrics = await input.run();
    const jsonMetrics = JSON.parse(JSON.stringify(metrics ?? {}));
    const durationMs = Date.now() - startedAt;

    await prisma.syncState.upsert({
      where: { key: syncKey },
      update: {
        syncedAt: now,
        meta: {
          ...meta,
          type: input.type,
          source: input.source,
          lastRunAt: now.toISOString(),
          lastAttemptAt: now.toISOString(),
          lastSuccessAt: now.toISOString(),
          lastRunDurationMs: durationMs,
          backoffMs: 0,
          backoffUntil: null,
          lastErrorAt: null,
          lastErrorMessage: null,
          metrics: jsonMetrics,
        },
      },
      create: {
        key: syncKey,
        syncedAt: now,
        meta: {
          type: input.type,
          source: input.source,
          lastRunAt: now.toISOString(),
          lastAttemptAt: now.toISOString(),
          lastSuccessAt: now.toISOString(),
          lastRunDurationMs: durationMs,
          backoffMs: 0,
          backoffUntil: null,
          lastErrorAt: null,
          lastErrorMessage: null,
          metrics: jsonMetrics,
        },
      },
    });

    console.log("[LYG_SYNC][RUNNER] success", {
      type: input.type,
      source: input.source,
      familyId: input.familyId,
      durationMs,
      metrics,
    });

    return {
      ok: true,
      type: input.type,
      source: input.source,
      durationMs,
      metrics,
    };
  } catch (err: any) {
    const durationMs = Date.now() - startedAt;
    const status = Number(err?.status ?? 0);
    const message = String(err?.message ?? err);
    const shouldBackoff = isRateLimitError(status, message);
    const nextBackoff = shouldBackoff ? nextBackoffMs(meta.backoffMs) : Number(meta.backoffMs ?? 0);
    const nextBackoffUntil = shouldBackoff ? new Date(Date.now() + nextBackoff).toISOString() : null;

    await prisma.syncState.upsert({
      where: { key: syncKey },
      update: {
        meta: {
          ...meta,
          type: input.type,
          source: input.source,
          lastRunAt: now.toISOString(),
          lastAttemptAt: now.toISOString(),
          lastRunDurationMs: durationMs,
          lastErrorAt: now.toISOString(),
          lastErrorMessage: message,
          backoffMs: shouldBackoff ? nextBackoff : 0,
          backoffUntil: shouldBackoff ? nextBackoffUntil : null,
        },
      },
      create: {
        key: syncKey,
        syncedAt: syncState?.syncedAt ?? null,
        meta: {
          type: input.type,
          source: input.source,
          lastRunAt: now.toISOString(),
          lastAttemptAt: now.toISOString(),
          lastRunDurationMs: durationMs,
          lastErrorAt: now.toISOString(),
          lastErrorMessage: message,
          backoffMs: shouldBackoff ? nextBackoff : 0,
          backoffUntil: shouldBackoff ? nextBackoffUntil : null,
        },
      },
    });

    console.error("[LYG_SYNC][RUNNER] failed", {
      type: input.type,
      source: input.source,
      familyId: input.familyId,
      status,
      message,
      shouldBackoff,
      backoffMs: shouldBackoff ? nextBackoff : 0,
      durationMs,
    });

    return {
      ok: false,
      type: input.type,
      source: input.source,
      reason: message,
      backoffMs: shouldBackoff ? nextBackoff : 0,
      durationMs,
    };
  } finally {
    await releaseSyncTypeLock(lock);
  }
}
