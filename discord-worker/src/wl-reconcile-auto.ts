// Réconciliation WL : le worker ping la route cron du panel toutes les ~15 min,
// qui remonte en WL3 (en direct sur LYG) tout Subteniente encore en WL < 3.
// N'agit que sur un vrai écart (idempotent) ; ne rétrograde jamais.

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000; // 15 min

function getBaseUrl(): string {
  return String(process.env.INGEST_BASE_URL ?? "").replace(/\/+$/, "");
}

function getSecret(): string {
  return String(process.env.INGEST_SECRET ?? process.env.DISCORD_WORKER_SECRET ?? "").trim();
}

export function getWlReconcileIntervalMs(): number {
  const parsed = Number(process.env.WL_RECONCILE_INTERVAL_MS);
  if (!Number.isFinite(parsed) || parsed < 300_000) return DEFAULT_INTERVAL_MS;
  return Math.floor(parsed);
}

let isRunning = false;

export async function runWlReconcileJob(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    const baseUrl = getBaseUrl();
    const secret = getSecret();
    if (!baseUrl || !secret) {
      console.warn("[WL_RECONCILE] skipped: missing INGEST_BASE_URL or INGEST_SECRET");
      return;
    }
    const res = await fetch(`${baseUrl}/api/cron/wl-reconcile`, {
      method: "POST",
      headers: { "x-ingest-secret": secret },
    });
    const bodyText = await res.text().catch(() => "");
    if (!res.ok) {
      console.error("[WL_RECONCILE] failed", { status: res.status, body: bodyText.slice(0, 300) });
      return;
    }
    console.log("[WL_RECONCILE] ok", bodyText.slice(0, 200));
  } catch (error) {
    console.error("[WL_RECONCILE] exception", error instanceof Error ? error.message : String(error));
  } finally {
    isRunning = false;
  }
}
