/**
 * Appels HTTP sortants du panel, avec timeout obligatoire.
 *
 * Un `try/catch` ne protège pas d'une requête qui n'aboutit jamais : sans
 * timeout, un service distant qui cesse de répondre fige l'appelant.
 *
 * Ce module contenait aussi un `fetchWithRetry` avec backoff exponentiel,
 * supprimé le 15/08/2026 — il n'avait jamais eu le moindre importateur depuis
 * le commit initial. Le retry est assuré là où il a du sens : l'outbox du
 * worker, qui sait distinguer une erreur temporaire d'une erreur définitive.
 */

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Fetch with timeout support
 * Default timeout: 10 seconds
 */
export async function fetchWithTimeout(
  url: string,
  init?: RequestInit & { timeoutMs?: number; requestId?: string }
): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const headers = new Headers(init?.headers);
  if (init?.requestId) {
    headers.set("x-request-id", init.requestId);
  }

  try {
    const response = await fetch(url, {
      ...init,
      headers,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}
