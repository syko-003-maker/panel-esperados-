// Détection automatique des départs : le worker ping la route cron du panel
// toutes les ~10 min, qui désactive les membres partis (plus vus au roster LYG
// depuis > grace, relatif au dernier sync). Cheap : un simple UPDATE ciblé.

const DEFAULT_INTERVAL_MS = 10 * 60 * 1000; // 10 min

function getBaseUrl(): string {
  return String(process.env.INGEST_BASE_URL ?? "").replace(/\/+$/, "");
}

function getSecret(): string {
  return String(process.env.INGEST_SECRET ?? process.env.DISCORD_WORKER_SECRET ?? "").trim();
}

export function getDepartedSweepIntervalMs(): number {
  const parsed = Number(process.env.DEPARTED_SWEEP_INTERVAL_MS);
  if (!Number.isFinite(parsed) || parsed < 120_000) return DEFAULT_INTERVAL_MS;
  return Math.floor(parsed);
}

let isRunning = false;

export async function runDepartedSweepJob(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    const baseUrl = getBaseUrl();
    const secret = getSecret();
    if (!baseUrl || !secret) {
      console.warn("[DEPARTED_SWEEP] skipped: missing INGEST_BASE_URL or INGEST_SECRET");
      return;
    }
    const res = await fetch(`${baseUrl}/api/cron/deactivate-departed`, {
      method: "POST",
      headers: { "x-ingest-secret": secret },
    });
    const bodyText = await res.text().catch(() => "");
    if (!res.ok) {
      console.error("[DEPARTED_SWEEP] failed", { status: res.status, body: bodyText.slice(0, 300) });
      return;
    }
    console.log("[DEPARTED_SWEEP] ok", bodyText.slice(0, 200));
  } catch (error) {
    console.error("[DEPARTED_SWEEP] exception", error instanceof Error ? error.message : String(error));
  } finally {
    isRunning = false;
  }
}
