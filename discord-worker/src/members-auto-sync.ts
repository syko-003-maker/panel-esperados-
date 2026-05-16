const DEFAULT_INTERVAL_MS = 45_000;

let lastMembersAutoSyncAt = 0;

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

export function getMembersSyncIntervalMs(): number {
  return parseIntervalMs(process.env.MEMBERS_AUTO_SYNC_INTERVAL_MS, DEFAULT_INTERVAL_MS);
}

export function getLastMembersAutoSyncAt(): number {
  return lastMembersAutoSyncAt;
}

export async function runMembersAutoSyncJob(): Promise<void> {
  const baseUrl = getBaseUrl();
  const secret = getSecret();

  if (!baseUrl || !secret) {
    console.warn("[MEMBERS_AUTO_SYNC] skipped: missing INGEST_BASE_URL or INGEST_SECRET");
    return;
  }

  const endpoint = `${baseUrl}/api/cron/members-auto-sync`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "x-ingest-secret": secret,
      },
    });

    const bodyText = await response.text().catch(() => "");

    if (!response.ok) {
      console.error("[MEMBERS_AUTO_SYNC] failed", {
        status: response.status,
        body: bodyText.slice(0, 500),
      });
      return;
    }

    lastMembersAutoSyncAt = Date.now();
    console.log("[MEMBERS_AUTO_SYNC] ok", {
      status: response.status,
      ranAt: new Date(lastMembersAutoSyncAt).toISOString(),
    });
  } catch (error) {
    console.error("[MEMBERS_AUTO_SYNC] exception", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
