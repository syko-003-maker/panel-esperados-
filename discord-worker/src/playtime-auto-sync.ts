// Avant : 1h. Maintenant : 10 min — refresh Member.playtime7d souvent pour
// que stats / dettes / alertes inactivité soient toujours à jour. Coût LYG
// négligeable (1 call / 10 min = ~1.5 calls / 15 min).
const DEFAULT_INTERVAL_MS = 10 * 60 * 1000;

let lastPlaytimeAutoSyncAt = 0;

function getBaseUrl(): string {
  return String(process.env.INGEST_BASE_URL ?? "").replace(/\/+$/, "");
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

export async function runPlaytimeAutoSyncJob(): Promise<void> {
  const baseUrl = getBaseUrl();
  const secret = getSecret();

  if (!baseUrl || !secret) {
    console.warn("[PLAYTIME_AUTO_SYNC] skipped: missing INGEST_BASE_URL or INGEST_SECRET");
    return;
  }

  const endpoint = `${baseUrl}/api/cron/playtime-auto-sync`;

  try {
    const response = await fetch(endpoint, {
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

    lastPlaytimeAutoSyncAt = Date.now();
    console.log("[PLAYTIME_AUTO_SYNC] ok", {
      status: response.status,
      ranAt: new Date(lastPlaytimeAutoSyncAt).toISOString(),
    });
  } catch (error) {
    console.error("[PLAYTIME_AUTO_SYNC] exception", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}