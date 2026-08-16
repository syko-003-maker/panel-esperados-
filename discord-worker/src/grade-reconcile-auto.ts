import { getInternalPanelUrl } from "./lib/urls.js";
import { fetchWithTimeout } from "./lib/http.js";
// Réconciliation des grades : le worker ping la route cron du panel toutes les
// ~15 min, qui aligne le champ grade stocké de chaque membre sur son rôle Discord
// réel (base uniquement, aucune écriture Discord). Corrige les grades restés en
// retard après une promotion manuelle sur Discord ou un ré-recrutement.

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000; // 15 min

function getBaseUrl(): string {
  return getInternalPanelUrl();
}

function getSecret(): string {
  return String(process.env.INGEST_SECRET ?? process.env.DISCORD_WORKER_SECRET ?? "").trim();
}

export function getGradeReconcileIntervalMs(): number {
  const parsed = Number(process.env.GRADE_RECONCILE_INTERVAL_MS);
  if (!Number.isFinite(parsed) || parsed < 300_000) return DEFAULT_INTERVAL_MS;
  return Math.floor(parsed);
}

let isRunning = false;

export async function runGradeReconcileJob(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    const baseUrl = getBaseUrl();
    const secret = getSecret();
    if (!baseUrl || !secret) {
      console.warn("[GRADE_RECONCILE] skipped: missing INGEST_BASE_URL or INGEST_SECRET");
      return;
    }
    const res = await fetchWithTimeout(`${baseUrl}/api/cron/grade-reconcile`, {
      method: "POST",
      headers: { "x-ingest-secret": secret },
    });
    const bodyText = await res.text().catch(() => "");
    if (!res.ok) {
      console.error("[GRADE_RECONCILE] failed", { status: res.status, body: bodyText.slice(0, 300) });
      return;
    }
    console.log("[GRADE_RECONCILE] ok", bodyText.slice(0, 200));
  } catch (error) {
    console.error("[GRADE_RECONCILE] exception", error instanceof Error ? error.message : String(error));
  } finally {
    isRunning = false;
  }
}
