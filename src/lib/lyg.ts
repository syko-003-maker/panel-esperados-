import { debug } from "./logger";

/**
 * LYG API Configuration
 */
type LygConfig = {
  baseUrl: string;
  token: string;
};

let cachedConfig: LygConfig | null = null;

/**
 * Get and validate LYG configuration
 * @throws Error if configuration is missing or invalid
 */
export function getLygConfig(): LygConfig {
  if (cachedConfig) return cachedConfig;

  const rawBaseUrl = process.env.LYG_BASE_URL;
  const rawToken = process.env.LYG_TOKEN;

  if (!rawBaseUrl) {
    throw new Error("Missing env: LYG_BASE_URL is required");
  }
  if (!rawToken) {
    throw new Error("Missing env: LYG_TOKEN is required");
  }

  // Normalize base URL
  let baseUrl = rawBaseUrl.trim();
  
  // Add protocol if missing (default to https)
  if (!baseUrl.match(/^https?:\/\//i)) {
    baseUrl = `https://${baseUrl}`;
  }

  // Remove trailing slash
  while (baseUrl.endsWith("/")) {
    baseUrl = baseUrl.slice(0, -1);
  }

  // CRITICAL: Ensure /api suffix is present exactly once
  // If already ends with /api, keep it. Otherwise, append /api
  if (!baseUrl.endsWith("/api")) {
    baseUrl = baseUrl + "/api";
  }

  cachedConfig = {
    baseUrl,
    token: rawToken.trim(),
  };

  debug("[lyg] Config loaded:", {
    baseUrl: cachedConfig.baseUrl,
    tokenPresent: true,
    tokenPrefix: cachedConfig.token.slice(0, 4) + "***",
  });

  return cachedConfig;
}

// Legacy exports for backward compatibility
const config = getLygConfig();
export const LYG_BASE_URL: string = config.baseUrl;
export const LYG_TOKEN: string = config.token;

type LygFetchOptions = {
  method?: "GET" | "POST";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  noStore?: boolean;
  retries?: number;
};

/**
 * Fetch wrapper for LYG API with retry logic
 */
export async function lygFetch<T>(path: string, opts: LygFetchOptions = {}): Promise<T> {
  const config = getLygConfig();
  const maxRetries = opts.retries ?? 2;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await lygFetchAttempt<T>(config, path, opts, attempt);
    } catch (err: any) {
      lastError = err;
      
      // Don't retry on auth errors
      if (err.message?.includes("401") || err.message?.includes("403")) {
        throw err;
      }

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        throw err;
      }

      // Backoff before retry
      const backoffMs = Math.min(1000 * Math.pow(2, attempt), 5000);
      debug(`[lyg] Retry ${attempt + 1}/${maxRetries} after ${backoffMs}ms`);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw lastError ?? new Error("LYG fetch failed");
}

async function lygFetchAttempt<T>(
  config: LygConfig,
  path: string,
  opts: LygFetchOptions,
  attempt: number
): Promise<T> {
  // Path should be relative (starting with /), concat directly to baseUrl
  const urlStr = path.startsWith("/") ? config.baseUrl + path : config.baseUrl + "/" + path;
  const url = new URL(urlStr);

  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
  }

  // CRITICAL: Log all LYG calls with full URL
  console.log("[LYG CALL]", {
    path,
    url: url.toString(),
    method: opts.method ?? "GET",
    timestamp: new Date().toISOString(),
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  debug(`[lyg] Fetch attempt ${attempt + 1}:`, url.toString());

  try {
    const res = await fetch(url, {
      method: opts.method ?? "GET",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: opts.noStore ? "no-store" : "force-cache",
      signal: controller.signal,
    });

    const raw = await res.text();
    let data: any = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = raw;
    }

    if (!res.ok) {
      const msg = (data && (data.message || data.error)) || `LYG request failed (${res.status})`;
      const error = new Error(msg);
      (error as any).status = res.status;
      (error as any).url = url.toString();
      (error as any).bodySnippet = raw.slice(0, 300);
      (error as any).response = data;
      throw error;
    }

    return data as T;
  } catch (err: any) {
    // Enhanced error for SSL/TLS issues
    if (err.message?.includes("SSL") || err.message?.includes("TLS") || err.code === "ERR_SSL_PACKET_LENGTH_TOO_LONG") {
      const hint = url.protocol === "https:" 
        ? "Possible HTTP/HTTPS mismatch. Check if LYG_BASE_URL should use http:// instead of https://"
        : "SSL/TLS error with HTTP URL";
      console.error(`[lyg] ${hint}`, { url: url.toString(), error: err.message });
      throw new Error(`${err.message} (URL: ${url.toString()})`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
