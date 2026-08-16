import { getInternalPanelUrl } from "./lib/urls.js";
import { fetchWithTimeout } from "./lib/http.js";
import { readSyncOutcome } from "./lib/sync-outcome.js";
const DEFAULT_INTERVAL_MS = 45_000;

let lastBanklogsAutoSyncAt = 0;

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

export function getBanklogsSyncIntervalMs(): number {
  return parseIntervalMs(process.env.BANKLOGS_AUTO_SYNC_INTERVAL_MS, DEFAULT_INTERVAL_MS);
}

export function getLastBanklogsAutoSyncAt(): number {
  return lastBanklogsAutoSyncAt;
}

let isRunningBanklogs = false;

export async function runBanklogsAutoSyncJob(): Promise<void> {
  // Garde anti-chevauchement : si le run précédent n'est pas terminé, on saute.
  if (isRunningBanklogs) {
    console.warn("[BANKLOGS_AUTO_SYNC] skip: run précédent encore en cours");
    return;
  }
  isRunningBanklogs = true;
  try {
    await runBanklogsAutoSyncJobInner();
  } finally {
    isRunningBanklogs = false;
  }
}

async function runBanklogsAutoSyncJobInner(): Promise<void> {
  const baseUrl = getBaseUrl();
  const secret = getSecret();

  if (!baseUrl || !secret) {
    console.warn("[BANKLOGS_AUTO_SYNC] skipped: missing INGEST_BASE_URL or INGEST_SECRET");
    return;
  }

  const endpoint = `${baseUrl}/api/cron/banklogs-auto-sync`;

  try {
    const response = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: {
        "x-ingest-secret": secret,
      },
    });

    const bodyText = await response.text().catch(() => "");

    if (!response.ok) {
      console.error("[BANKLOGS_AUTO_SYNC] failed", {
        status: response.status,
        body: bodyText.slice(0, 500),
      });
      return;
    }

    // Voir playtime-auto-sync.ts : l'horodatage suit l'aller-retour, pas la
    // synchronisation. Ici c'est indispensable — la garde d'1 min et la cadence
    // d'1 min se croisent, environ un tir sur trois est ignoré, et le seuil de
    // stall est à 2 min. Ne l'avancer que sur un vrai SYNC ferait crier le
    // détecteur alors que tout va bien.
    lastBanklogsAutoSyncAt = Date.now();

    const outcome = readSyncOutcome(bodyText);
    console.log(`[BANKLOGS_AUTO_SYNC] ${outcome.label}`, {
      status: response.status,
      ...(outcome.reason ? { skippedBecause: outcome.reason } : {}),
      ...(outcome.durationMs !== undefined ? { durationMs: outcome.durationMs } : {}),
      ranAt: new Date(lastBanklogsAutoSyncAt).toISOString(),
    });
  } catch (error) {
    console.error("[BANKLOGS_AUTO_SYNC] exception", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
