import { debug, error as logError } from "./logger";
import { getLygConfig } from "./lyg";
import { recordLygCall, normalizeLygEndpoint } from "@/lib/lyg-stats";

/**
 * LYG Fetch error with detailed diagnostics
 */
export type LygFetchError = {
  status: number;
  url: string;
  method: string;
  bodySnippet: string;
  contentType: string | null;
  message: string;
};

/**
 * LYG Fetch options
 */
export type LygFetchOpts = {
  method?: "GET" | "POST";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  noStore?: boolean;
  retries?: number;
  timeout?: number;
};

/**
 * Wrapper unique pour tous les appels LYG
 * - Capture URLs + status + body snippets
 * - Headers auth configurés correctement
 * - Timeout + retry
 * - Jamais masquer les vrais erreurs
 */
export async function lygFetchWithDiagnostics<T>(
  path: string,
  opts: LygFetchOpts = {}
): Promise<{ data: T; status: number }> {
  const config = getLygConfig();
  const maxRetries = opts.retries ?? 1;
  let lastError: LygFetchError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await lygFetchAttemptWithDiag<T>(config, path, opts, attempt);
    } catch (err: any) {
      lastError = err;

      // Don't retry on auth/permission errors
      if (err.status && (err.status === 401 || err.status === 403)) {
        throw err;
      }

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        throw err;
      }

      // Backoff before retry (1s for first retry)
      const backoffMs = 1000 * Math.pow(2, attempt);
      debug(`[lyg-fetch] Retry ${attempt + 1}/${maxRetries} in ${backoffMs}ms for ${path}`);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw lastError ?? new Error(`LYG fetch failed for ${path}`);
}

async function lygFetchAttemptWithDiag<T>(
  config: { baseUrl: string; token: string },
  path: string,
  opts: LygFetchOpts,
  attempt: number
): Promise<{ data: T; status: number }> {
  // Build URL
  const urlStr = path.startsWith("/") ? config.baseUrl + path : config.baseUrl + "/" + path;
  const url = new URL(urlStr);

  // Add query params
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
  }

  const method = opts.method ?? "GET";
  const timeout = opts.timeout ?? 15_000;
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeout);

  debug(
    `[lyg-fetch] Attempt ${attempt + 1}: ${method} ${url.toString()}`
  );

  try {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: opts.noStore ? "no-store" : "force-cache",
      signal: controller.signal,
    });

    // Always read body as text first
    const bodyText = await res.text();
    const contentType = res.headers.get("content-type");

    // Track le call dans le compteur global.
    try {
      recordLygCall({ ok: res.ok, status: res.status, endpoint: normalizeLygEndpoint(path) });
    } catch {
      /* tracking non bloquant */
    }

    if (!res.ok) {
      // Error response - structure it
      const snippet = bodyText.slice(0, 800);
      const error: LygFetchError = {
        status: res.status,
        url: url.toString(),
        method,
        bodySnippet: snippet,
        contentType,
        message: `LYG ${method} ${path} returned ${res.status}`,
      };

      debug(
        `[lyg-fetch] Error ${res.status}: ${method} ${path}`,
        { bodySnippetStart: snippet.slice(0, 100) }
      );

      throw error;
    }

    // Success - parse JSON
    let data: T;
    try {
      data = bodyText ? JSON.parse(bodyText) : ({} as T);
    } catch (parseErr) {
      const error: LygFetchError = {
        status: res.status,
        url: url.toString(),
        method,
        bodySnippet: bodyText.slice(0, 800),
        contentType,
        message: `LYG ${method} ${path} returned non-JSON response`,
      };

      debug(
        `[lyg-fetch] Parse error: ${method} ${path} returned ${contentType}`,
        { bodyStart: bodyText.slice(0, 100) }
      );

      throw error;
    }

    debug(`[lyg-fetch] Success ${res.status}: ${method} ${path}`);

    return { data, status: res.status };
  } catch (err: any) {
    // Handle network/timeout errors
    if (err.name === "AbortError") {
      throw {
        status: 0,
        url: url.toString(),
        method,
        bodySnippet: "Request timeout after " + timeout + "ms",
        contentType: null,
        message: `LYG ${method} ${path} timed out`,
      } as LygFetchError;
    }

    // Re-throw structured errors
    if (err.status !== undefined) {
      throw err;
    }

    // Unknown errors
    throw {
      status: 0,
      url: url.toString(),
      method,
      bodySnippet: err.message || "Unknown error",
      contentType: null,
      message: `LYG ${method} ${path} failed: ${err.message}`,
    } as LygFetchError;
  } finally {
    clearTimeout(timeoutHandle);
  }
}
