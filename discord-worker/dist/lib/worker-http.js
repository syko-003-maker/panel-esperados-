import { logWarn } from "./worker-obs";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_OPTS = {
    retries: 3,
    minDelayMs: 300,
    maxDelayMs: 3000,
};
/**
 * Exponential backoff with jitter
 */
function calculateBackoff(attempt, opts) {
    const exponential = opts.minDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * (opts.maxDelayMs - opts.minDelayMs);
    return Math.min(opts.maxDelayMs, exponential + jitter);
}
/**
 * Determine if response should trigger a retry
 */
function shouldRetry(res, err) {
    // Network errors always retry
    if (err) {
        return true;
    }
    // HTTP status codes
    if (res) {
        const status = res.status;
        // Retry on timeout, too many requests, server errors
        if (status === 408 || status === 429)
            return true;
        if (status >= 500)
            return true;
        return false;
    }
    return false;
}
/**
 * Fetch with retry logic and exponential backoff
 * Default: 3 retries, min 300ms, max 3000ms delay
 */
export async function fetchWithRetry(url, init, retryOpts) {
    const opts = {
        ...DEFAULT_RETRY_OPTS,
        ...retryOpts,
    };
    let lastError;
    let lastResponse;
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
            }
            finally {
                clearTimeout(timeoutId);
            }
        }
        catch (error) {
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
