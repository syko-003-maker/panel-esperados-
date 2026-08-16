import { getInternalPanelUrl } from "./urls.js";
/**
 * Notification push via le panel (route interne /api/ingest/push).
 * Le worker n'a ni la lib web-push ni les clés VAPID : on délègue au panel,
 * même pattern que ingest.ts (INGEST_BASE_URL + x-ingest-secret).
 * Fire-and-forget : un échec de push ne doit jamais casser un poller.
 */

const BASE_URL = getInternalPanelUrl();
const SECRET = process.env.INGEST_SECRET ?? "";

type PushTarget = { audience: "staff" } | { discordIds: string[] };

export async function pushNotify(
  target: PushTarget,
  payload: { title: string; body: string; url?: string; tag?: string }
): Promise<void> {
  if (!BASE_URL || !SECRET) return;
  try {
    const res = await fetch(`${BASE_URL}/api/ingest/push`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-ingest-secret": SECRET },
      body: JSON.stringify({ ...target, ...payload }),
      signal: AbortSignal.timeout(5_000),
    } as RequestInit);
    if (!res.ok) {
      console.warn(`[pushNotify] HTTP ${res.status} sur /api/ingest/push`);
    }
  } catch (err) {
    console.warn("[pushNotify] échec:", err instanceof Error ? err.message : String(err));
  }
}
