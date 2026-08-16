import { getInternalPanelUrl } from "./lib/urls.js";
import { fetchWithTimeout } from "./lib/http.js";
import { readSyncOutcome } from "./lib/sync-outcome.js";
// Avant : 1h. Maintenant : 10 min — refresh Member.playtime7d souvent pour
// que stats / dettes / alertes inactivité soient toujours à jour. Coût LYG
// négligeable (1 call / 10 min = ~1.5 calls / 15 min).
const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;

let lastPlaytimeAutoSyncAt = 0;

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

export function getPlaytimeSyncIntervalMs(): number {
  return parseIntervalMs(process.env.PLAYTIME_AUTO_SYNC_INTERVAL_MS, DEFAULT_INTERVAL_MS);
}

export function getLastPlaytimeAutoSyncAt(): number {
  return lastPlaytimeAutoSyncAt;
}

let isRunningPlaytime = false;

export async function runPlaytimeAutoSyncJob(): Promise<void> {
  if (isRunningPlaytime) {
    console.warn("[PLAYTIME_AUTO_SYNC] skip: run précédent encore en cours");
    return;
  }
  isRunningPlaytime = true;
  try {
    await runPlaytimeAutoSyncJobInner();
  } finally {
    isRunningPlaytime = false;
  }
}

async function runPlaytimeAutoSyncJobInner(): Promise<void> {
  const baseUrl = getBaseUrl();
  const secret = getSecret();

  if (!baseUrl || !secret) {
    console.warn("[PLAYTIME_AUTO_SYNC] skipped: missing INGEST_BASE_URL or INGEST_SECRET");
    return;
  }

  const endpoint = `${baseUrl}/api/cron/playtime-auto-sync`;

  try {
    const response = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        "x-ingest-secret": secret,
      },
    });

    const bodyText = await response.text().catch(() => "");

    if (!response.ok) {
      console.error("[PLAYTIME_AUTO_SYNC] failed", {
        status: response.status,
        body: bodyText.slice(0, 500),
      });
      return;
    }

    // L'horodatage marque un aller-retour réussi avec le panel, pas une
    // synchronisation effective : c'est ce que surveille le détecteur de stall
    // (`intervalMs * 2` dans index.ts). Le distinguer ici déclencherait de
    // fausses alertes « stalled » à chaque saut légitime.
    lastPlaytimeAutoSyncAt = Date.now();

    const outcome = readSyncOutcome(bodyText);
    console.log(`[PLAYTIME_AUTO_SYNC] ${outcome.label}`, {
      status: response.status,
      ...(outcome.reason ? { skippedBecause: outcome.reason } : {}),
      ...(outcome.durationMs !== undefined ? { durationMs: outcome.durationMs } : {}),
      ranAt: new Date(lastPlaytimeAutoSyncAt).toISOString(),
    });
  } catch (error) {
    console.error("[PLAYTIME_AUTO_SYNC] exception", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}