/**
 * Appels HTTP sortants du worker, avec timeout obligatoire.
 *
 * Pourquoi : les 9 déclencheurs de cron du worker appelaient `/api/cron/*`
 * sans aucun timeout. Un `try/catch` ne protège pas d'une requête qui
 * n'aboutit jamais — si le panel cesse de répondre, le `fetch` reste pendu et
 * le cycle suivant ne part pas. Une synchronisation peut donc s'arrêter en
 * silence, sans erreur, sans trace.
 *
 * Jumeau de `src/lib/http.ts` côté panel (builds séparés, pas d'import
 * possible entre les deux), volontairement réduit à ce dont le worker a
 * besoin : un timeout et une erreur lisible.
 */

/** 30 s : les routes /api/cron/* synchronisent des membres, du playtime, des
 *  banklogs — elles sont légitimement lentes. Trop court couperait un travail
 *  en cours et le ferait recommencer indéfiniment. */
export const DEFAULT_CRON_TIMEOUT_MS = 30_000;

export class HttpTimeoutError extends Error {
  readonly timeoutMs: number;
  readonly url: string;
  constructor(url: string, timeoutMs: number) {
    // Le mot « timeout » est repris tel quel par classifyOutboxError(), qui le
    // classe TEMPORAIRE : un appel qui expire doit être réessayé, pas abandonné.
    super(`Request timeout after ${timeoutMs}ms: ${url}`);
    this.name = "HttpTimeoutError";
    this.timeoutMs = timeoutMs;
    this.url = url;
  }
}

/**
 * `fetch` avec timeout. Comportement identique à `fetch` en cas de succès :
 * on renvoie la Response telle quelle, sans rien interpréter.
 *
 * En cas de dépassement, lève `HttpTimeoutError` plutôt que l'`AbortError`
 * générique — le message indique l'URL et le délai, ce qui évite d'avoir à
 * deviner quel appel a expiré en lisant les logs.
 */
export async function fetchWithTimeout(
  url: string,
  init?: RequestInit & { timeoutMs?: number }
): Promise<Response> {
  const timeoutMs = init?.timeoutMs ?? DEFAULT_CRON_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    // AbortError = notre propre timeout. Toute autre erreur remonte inchangée.
    if (err instanceof Error && err.name === "AbortError") {
      throw new HttpTimeoutError(url, timeoutMs);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
