import { getInternalPanelUrl } from "./lib/urls.js";
import { fetchWithTimeout } from "./lib/http.js";
/**
 * Cron worker : déclenche /api/staff/absences/expire-discord pour supprimer
 * les messages Discord des absences dont endAt est passé.
 *
 * Le panel s'occupe du reste (enqueue DELETE_MESSAGE + clear discordMessageId).
 * Ici on ne fait que ping la route.
 */

const DEFAULT_INTERVAL_MS = 15 * 60_000; // 15 min

let lastAbsencesExpireAt = 0;

function getBaseUrl(): string {
  return getInternalPanelUrl();
}

function getSecret(): string {
  return String(process.env.INGEST_SECRET ?? "").trim();
}

function parseIntervalMs(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 60_000) return fallback;
  return Math.floor(parsed);
}

export function getAbsencesExpireIntervalMs(): number {
  return parseIntervalMs(process.env.ABSENCES_EXPIRE_INTERVAL_MS, DEFAULT_INTERVAL_MS);
}

export function getLastAbsencesExpireAt(): number {
  return lastAbsencesExpireAt;
}

let isRunningAbsencesExpire = false;

export async function runAbsencesExpireJob(): Promise<void> {
  if (isRunningAbsencesExpire) {
    console.warn("[ABSENCES_EXPIRE] skip: run précédent encore en cours");
    return;
  }
  isRunningAbsencesExpire = true;
  try {
    await runAbsencesExpireJobInner();
  } finally {
    isRunningAbsencesExpire = false;
  }
}

async function runAbsencesExpireJobInner(): Promise<void> {
  const baseUrl = getBaseUrl();
  const secret = getSecret();

  if (!baseUrl || !secret) {
    console.warn("[ABSENCES_EXPIRE] skipped: missing INGEST_BASE_URL or INGEST_SECRET");
    return;
  }

  const endpoint = `${baseUrl}/api/staff/absences/expire-discord`;

  try {
    const response = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers: { "x-cron-secret": secret },
    });

    const bodyText = await response.text().catch(() => "");

    if (!response.ok) {
      console.error("[ABSENCES_EXPIRE] failed", {
        status: response.status,
        body: bodyText.slice(0, 500),
      });
      return;
    }

    lastAbsencesExpireAt = Date.now();
    let parsed: { deleted?: number } | null = null;
    try { parsed = bodyText ? JSON.parse(bodyText) : null; } catch { /* ignore */ }
    console.log("[ABSENCES_EXPIRE] ok", {
      deleted: parsed?.deleted ?? 0,
      ranAt: new Date(lastAbsencesExpireAt).toISOString(),
    });
  } catch (err) {
    console.error("[ABSENCES_EXPIRE] exception", err instanceof Error ? err.message : String(err));
  }
}
