import { logWarn } from "./worker-obs";

/**
 * Production-ready HTTP module for Discord worker with retry logic
 * - Exponential backoff with jitter
 * - Smart retry logic based on status codes
 */

export interface RetryOpts {
  retries: number; // Number of retry attempts after initial request
  minDelayMs: number; // Minimum delay between retries
  maxDelayMs: number; // Maximum delay between retries
}

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_OPTS: RetryOpts = {
  retries: 3,
  minDelayMs: 300,
  maxDelayMs: 3000,
};

/**
 * Exponential backoff with jitter
 */
function calculateBackoff(
  attempt: number,
  opts: RetryOpts
): number {
  const exponential = opts.minDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * (opts.maxDelayMs - opts.minDelayMs);
  return Math.min(opts.maxDelayMs, exponential + jitter);
}

/**
 * Determine if response should trigger a retry
 */
function shouldRetry(res?: Response, err?: unknown): boolean {
  // Network errors always retry
  if (err) {
    return true;
  }

  // HTTP status codes
  if (res) {
    const status = res.status;
    // Retry on timeout, too many requests, server errors
    if (status === 408 || status === 429) return true;
    if (status >= 500) return true;
    return false;
  }

  return false;
}

/**
 * Fetch with retry logic and exponential backoff
 * Default: 3 retries, min 300ms, max 3000ms delay
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit & { timeoutMs?: number; jobId?: string },
  retryOpts?: Partial<RetryOpts>
): Promise<Response> {
  const opts: RetryOpts = {
    ...DEFAULT_RETRY_OPTS,
    ...retryOpts,
  };

  let lastError: unknown;
  let lastResponse: Response | undefined;

  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const headers = new Headers(init?.headers);
      if (init?.jobId) {
        headers.set("x-job-id", init.jobId);
      }

      try {
        const response = await fetch(url, {
          ...init,
          headers,
          signal: controller.signal,
        });

        lastResponse = response;

        // Check if we should retry based on status
        if (shouldRetry(response, undefined)) {
          if (attempt < opts.retries) {
            const delayMs = calculateBackoff(attempt, opts);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            continue;
          }
        }

        return response;
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (error) {
      lastError = error;

      // Check if we should retry based on error
      if (shouldRetry(undefined, error)) {
        if (attempt < opts.retries) {
          const delayMs = calculateBackoff(attempt, opts);
          logWarn("worker_fetch_retry", {
            url,
            attempt: attempt + 1,
            maxRetries: opts.retries,
            delayMs,
            jobId: init?.jobId,
          });
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
      }

      throw error;
    }
  }

  // If we exhausted retries with a response, return it
  if (lastResponse) {
    return lastResponse;
  }

  // Otherwise throw the last error
  throw lastError || new Error(`Failed to fetch ${url} after ${opts.retries} retries`);
}
