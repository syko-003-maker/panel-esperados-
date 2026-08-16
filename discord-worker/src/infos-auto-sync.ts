import { getInternalPanelUrl } from "./lib/urls.js";
import { fetchWithTimeout } from "./lib/http.js";
import { readSyncOutcome } from "./lib/sync-outcome.js";
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;

let lastInfosAutoSyncAt = 0;

function getBaseUrl(): string {
  return getInternalPanelUrl();
}

function getSecret(): string {
  return String(process.env.INGEST_SECRET ?? process.env.DISCORD_WORKER_SECRET ?? "").trim();
}

function parseIntervalMs(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 10_000) return fallback;
  return Math.floor(parsed);
}

export function getInfosSyncIntervalMs(): number {
  return parseIntervalMs(process.env.INFOS_AUTO_SYNC_INTERVAL_MS, DEFAULT_INTERVAL_MS);
}

export function getLastInfosAutoSyncAt(): number {
  return lastInfosAutoSyncAt;
}

let isRunningInfos = false;

export async function runInfosAutoSyncJob(): Promise<void> {
  if (isRunningInfos) {
    console.warn("[INFOS_AUTO_SYNC] skip: run précédent encore en cours");
    return;
  }
  isRunningInfos = true;
  try {
    await runInfosAutoSyncJobInner();
  } finally {
    isRunningInfos = false;
  }
}

async function runInfosAutoSyncJobInner(): Promise<void> {
  const baseUrl = getBaseUrl();
  const secret = getSecret();

  if (!baseUrl || !secret) {
    console.warn("[INFOS_AUTO_SYNC] skipped: missing INGEST_BASE_URL or INGEST_SECRET");
    return;
  }

  const endpoint = `${baseUrl}/api/cron/infos-auto-sync`;

  try {
    const response = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        "x-ingest-secret": secret,
      },
    });

    const bodyText = await response.text().catch(() => "");

    if (!response.ok) {
      console.error("[INFOS_AUTO_SYNC] failed", {
        status: response.status,
        body: bodyText.slice(0, 500),
      });
      return;
    }

    lastInfosAutoSyncAt = Date.now();
    const outcome = readSyncOutcome(bodyText);
    console.log(`[INFOS_AUTO_SYNC] ${outcome.label}`, {
      status: response.status,
      ...(outcome.reason ? { skippedBecause: outcome.reason } : {}),
      ...(outcome.durationMs !== undefined ? { durationMs: outcome.durationMs } : {}),
      ranAt: new Date(lastInfosAutoSyncAt).toISOString(),
    });
  } catch (error) {
    console.error("[INFOS_AUTO_SYNC] exception", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}