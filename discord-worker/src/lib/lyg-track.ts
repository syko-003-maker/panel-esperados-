/**
 * Helper pour reporter les appels LYG au panel (pour la page Système).
 * Fire-and-forget — n'échoue jamais.
 */

const PANEL_URL = process.env.PANEL_URL ?? process.env.NEXTAUTH_URL ?? "http://127.0.0.1:3000";
const INGEST_SECRET = process.env.INGEST_SECRET ?? "";

export function trackLygCall(ok: boolean, status: number, endpoint: string): void {
  if (!INGEST_SECRET) return;
  void fetch(`${PANEL_URL}/api/internal/lyg-track`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-ingest-secret": INGEST_SECRET,
    },
    body: JSON.stringify({ type: "call", service: "worker", ok, status, endpoint }),
    signal: AbortSignal.timeout(2000),
  } as RequestInit).catch(() => {
    // ignore — tracking ne doit jamais bloquer
  });
}
