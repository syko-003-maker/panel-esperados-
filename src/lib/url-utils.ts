/**
 * URL utilities for safe joining and normalization
 */

export interface LygUrlConfig {
  baseUrl: string;
  token: string;
}

/**
 * Normalize LYG base URL to ensure it ends with /api (but not /api/api)
 * 
 * Examples:
 * - "https://api.lyg.fr" → "https://api.lyg.fr/api"
 * - "https://api.lyg.fr/api" → "https://api.lyg.fr/api"
 * - "https://api.lyg.fr/api/" → "https://api.lyg.fr/api"
 */
export function normalizeLygBaseUrl(raw: string): string {
  if (!raw) throw new Error("LYG_BASE_URL is empty");

  let normalized = raw.trim();

  // Remove trailing slash
  if (normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }

  // If already ends with /api, we're good
  if (normalized.endsWith("/api")) {
    return normalized;
  }

  // If ends with something else (shouldn't happen), append /api
  return normalized + "/api";
}

/**
 * Join base URL with path safely
 * 
 * Examples:
 * - joinUrl("https://api.lyg.fr/api", "/banklogs") → "https://api.lyg.fr/api/banklogs"
 * - joinUrl("https://api.lyg.fr/api", "banklogs") → "https://api.lyg.fr/api/banklogs"
 */
export function joinUrl(base: string, path: string): string {
  if (!base) throw new Error("Base URL is empty");

  // Ensure base has no trailing slash
  const cleanBase = base.endsWith("/") ? base.slice(0, -1) : base;

  // Ensure path starts with /
  const cleanPath = path.startsWith("/") ? path : "/" + path;

  return cleanBase + cleanPath;
}

/**
 * Extract snippet from body (for logging)
 */
export function bodySnippet(text: string | undefined, maxLen = 800): string {
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) + "..." : text;
}
