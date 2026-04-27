import "server-only";

/**
 * Simplified LYG API Client
 * 
 * CRITICAL FIXES:
 * - Uses SINGLE stable endpoint: /api/darkrp/familles/esperados/members
 * - Forces FAMILY_SLUG = "esperados" (ignores input)
 * - Prevents /api/api/ double paths with joinUrl()
 * - Safe JSON parsing: reads res.text() + JSON.parse in try/catch
 * - Comprehensive logging: [LYG] -> method url, [LYG] <- status method url
 */

import { debug, error as logError } from "./logger";

// ✅ FORCE FAMILY SLUG + FAMILY NAME
const FAMILY_SLUG = "esperados";
const FAMILY_NAME = "Los Esperados";

// ✅ Single stable endpoint (DarkRP API)
const LYG_MEMBERS_ENDPOINT = `/api/darkrp/familles/${FAMILY_SLUG}/members`;
const LYG_BANKLOGS_ENDPOINT_PRIMARY = `/api/darkrp/familles/${encodeURIComponent(FAMILY_NAME)}/banklogs`;

export interface LygMember {
  steamId64: string;
  family?: string;
  rank?: string;
  owner?: boolean;
  rpName?: string;
  grade?: string;
  joinedAt?: any;
  isActive?: boolean;
  discordId?: string;
}

export interface LygResponse<T = any> {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: Record<string, string>;
  data?: T;
  text?: string;
  contentType?: string | null;
  error?: string;
  hint?: string;
  resolvedUrl?: string;
  duration?: number;
  meta?: {
    url?: string;
    status?: number;
    contentType?: string | null;
    durationMs?: number;
    rootKeys?: string[];
    extractedCount?: number;
    skippedInvalid?: number;
    chosenKey?: string;
    urlUsed?: string;
    precisionWarning?: boolean;
  };
}

/**
 * Safe JSON parse that handles SteamID64 precision loss.
 * SteamID64 is 17 digits (76561198xxxxxxxxx), which exceeds Number.MAX_SAFE_INTEGER.
 * If LYG returns steamid as a number, JSON.parse converts it and loses precision.
 *
 * Solution: Convert numeric steamid fields to strings BEFORE JSON.parse using regex.
 * Handles all SteamID field name variants (case-insensitive variations).
 */
function safeLygJsonParse(rawText: string): {
  data: any;
  precisionWarning: boolean;
} {
  if (!rawText) {
    return { data: null, precisionWarning: false };
  }

  let modified = rawText;
  let precisionWarning = false;

  // List of all SteamID field name variants to convert
  const steamIdVariants = [
    "steamId64", "steamid64", "steam_id64", "steamID64",
    "steamid", "steamId", "steam_id", "playerSteamId",
    "player_steam_id", "steamIdRaw", "steam_id_raw"
  ];

  // Convert all variants: "fieldName": number (17 digits) to "fieldName": "number"
  for (const fieldName of steamIdVariants) {
    const regex = new RegExp(`"${fieldName}"\\s*:\\s*(\\d{17})([,\\}])`, "g");
    if (regex.test(rawText)) {
      modified = modified.replace(
        new RegExp(`"${fieldName}"\\s*:\\s*(\\d{17})`, "g"),
        `"${fieldName}":"$1"`
      );
      precisionWarning = true;
    }
  }

  try {
    const data = JSON.parse(modified);
    return { data, precisionWarning };
  } catch (err: any) {
    logError("[lyg-parse] JSON parse error:", err.message);
    return { data: null, precisionWarning };
  }
}

/**
 * ✅ CRITICAL: Joins base URL + path intelligently.
 * Avoids double /api if LYG_BASE_URL already ends with /api.
 *
 * Examples:
 * - base: https://api.lyg.fr, path: /api/darkrp/... → https://api.lyg.fr/api/darkrp/...
 * - base: https://api.lyg.fr/api, path: /api/darkrp/... → https://api.lyg.fr/api/darkrp/...
 */
function joinUrl(baseUrl: string, path: string): string {
  // Remove trailing slashes from base
  const base = baseUrl.replace(/\/+$/, "");

  // If base ends with /api and path starts with /api, remove /api from path
  let normalizedPath = path;
  if (base.endsWith("/api") && path.startsWith("/api/")) {
    normalizedPath = path.slice(4); // Remove /api from start
  }

  // Ensure path starts with /
  const pathPrefix = normalizedPath.startsWith("/") ? "" : "/";

  return `${base}${pathPrefix}${normalizedPath}`;
}

/**
 * Get LYG configuration from environment.
 */
function getLygConfig(): { baseUrl: string; token: string } {
  const baseUrl = process.env.LYG_BASE_URL?.trim();
  const token = process.env.LYG_TOKEN?.trim();

  if (!baseUrl || !token) {
    throw new Error(
      `Missing LYG config: baseUrl=${!!baseUrl}, token=${!!token}`
    );
  }

  return { baseUrl, token };
}

/**
 * Extract array from LYG response supporting multiple formats:
 * - Format A: { data: [...] }
 * - Format B: { members: [...] }
 * - Format C: [ ... ] (direct array)
 * - Format D: { message, familyName, data: [...] }
 * - Format E: { result: [...] }
 *
 * Returns { array, chosenKey } where chosenKey describes which format was found.
 */
export function extractArrayFromLygResponse(
  response: any,
  contentType?: string | null
): { array: any[]; chosenKey: string } {
  if (Array.isArray(response)) {
    debug("[lyg-parse] Array extraction", {
      format: "direct",
      contentType,
      length: response.length,
    });
    return { array: response, chosenKey: "direct" };
  }

  if (!response || typeof response !== "object") {
    debug("[lyg-parse] Invalid response type:", {
      type: typeof response,
      contentType,
    });
    return { array: [], chosenKey: "invalid" };
  }

  const rootKeys = Object.keys(response);
  debug("[lyg-parse] Response root keys:", {
    keys: rootKeys,
    count: rootKeys.length,
    contentType,
  });

  const preferredKeys = [
    "members",
    "membres",
    "data",
    "result",
    "items",
    "content",
    "payload",
    "response",
    "value",
  ] as const;

  // Try preferred keys first
  for (const key of preferredKeys) {
    if (Array.isArray((response as any)[key])) {
      const arr = (response as any)[key];
      debug("[lyg-parse] Array extraction", {
        format: `preferred:${key}`,
        length: arr.length,
      });
      return { array: arr, chosenKey: `preferred:${key}` };
    }
  }

  // No array found
  debug("[lyg-parse] No array found in response", { rootKeys });
  return { array: [], chosenKey: "none" };
}

/**
 * Normalize and validate member object from LYG response.
 * ✅ Handles multiple steamId field name variants
 * ✅ Handles scientific notation edge case (7.656e+16 format)
 */
export function normalizeLygMember(item: any, defaultFamily: string): LygMember | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  // Extract steamId (try multiple field names, prioritize steamId64 variants)
  // ✅ EXTENDED: Added support for more field name variants
  let steamIdRaw =
    item.steamId64 ??
    item.steamid64 ??
    item.steam_id64 ??
    item.steamID64 ??
    item.steamIdRaw ??
    item.steamid ??
    item.steamId ??
    item.steam_id ??
    item.playerSteamId ??
    item.player_steam_id ??
    item.steam_id_raw ??
    item.id;  // Last resort: generic ID field

  if (typeof steamIdRaw === "number" && !Number.isSafeInteger(steamIdRaw)) {
    console.warn("[lyg-members] WARN: steamId not safe integer:", steamIdRaw);
  }

  let steamId64 = String(steamIdRaw ?? "").trim();

  // ✅ HANDLE SCIENTIFIC NOTATION: If steamId is in format "7.656e+16", try to convert
  if (steamId64.includes("e") && steamId64.includes("+")) {
    try {
      const numValue = parseFloat(steamId64);
      if (!isNaN(numValue) && Number.isSafeInteger(numValue)) {
        steamId64 = String(Math.floor(numValue));
        console.log("[lyg-members] Converted from scientific notation", {
          original: steamIdRaw,
          converted: steamId64,
        });
      }
    } catch (e) {
      // Ignore conversion error
    }
  }

  // Skip if no steam identifier - log diagnostic info
  if (!steamId64 || steamId64 === "") {
    const rpName = item.rpName || item.name || item.nomRP || "<unknown>";
    const availableKeys = Object.keys(item).filter(k => k.toLowerCase().includes("steam") || k.toLowerCase().includes("id"));
    debug("[lyg-members] Skipping member: no valid steamId", {
      rpName,
      availableKeys,
      itemKeys: Object.keys(item).slice(0, 10),
    });
    return null;
  }

  // Validate steamId64 format: exactly 17 digits, no scientific notation
  if (!/^\d{17}$/.test(steamId64)) {
    const rpName = item.rpName || item.name || item.nomRP || "<unknown>";
    const availableKeys = Object.keys(item).filter(k => k.toLowerCase().includes("steam") || k.toLowerCase().includes("id"));
    console.warn("[lyg-members] REJECTED: Invalid steamId64 format", {
      rpName,
      rawValue: steamIdRaw,
      steamId64Value: steamId64,
      availableKeys,
      reason: "not exactly 17 digits",
    });
    debug("[lyg-members] Member rejected: invalid steamId64", {
      rpName,
      rawValue: steamIdRaw,
      steamId64Value: steamId64,
      availableKeys,
    });
    return null;
  }

  // Extract family name
  const family =
    item.family ?? item.familyName ?? defaultFamily ?? "unknown";

  // Extract rank/grade
  const rank =
    item.class ?? item.rank ?? item.grade ?? item.type ?? null;

  // Extract owner flag
  const owner = item.owner ?? item.isOwner ?? item.ownerFlag ?? false;

  return {
    steamId64,
    family: String(family),
    rank: rank ? String(rank) : undefined,
    owner: Boolean(owner),
    rpName: item.rpName || item.name || item.nomRP || item.username,
    grade: item.grade || item.rank || null,
    joinedAt: item.joinedAt || item.joined_at || item.createdAt,
    isActive: item.isActive ?? item.active ?? true,
    discordId: item.discordId || item.discord_id,
  };
}

/**
 * Internal fetch with comprehensive error handling.
 */
async function lyFetch<T = any>(
  path: string,
  opts?: {
    method?: "GET" | "POST";
    timeoutMs?: number;
    returnText?: boolean;
  }
): Promise<LygResponse<T>> {
  const startTime = Date.now();
  const timeoutMs = opts?.timeoutMs || 10_000;
  const method = opts?.method || "GET";
  const returnText = opts?.returnText || false;

  let config: { baseUrl: string; token: string };
  try {
    config = getLygConfig();
  } catch (err: any) {
    logError("[lyg-client] CONFIG_ERROR:", err.message);
    console.error("[LYG] CONFIG_ERROR:", err.message);
    return {
      ok: false,
      status: 0,
      headers: {},
      error: err.message,
      duration: Date.now() - startTime,
    };
  }

  const resolvedUrl = joinUrl(config.baseUrl, path);
  debug(`[lyg-client] Fetching ${method} ${path}`, {
    resolvedUrl,
    timeoutMs,
  });

  // ✅ Log the LYG call
  console.log(`[LYG] -> ${method} ${resolvedUrl}`);

  try {
    // Validate URL format
    if (!resolvedUrl.startsWith("http")) {
      throw new Error(`Invalid URL format: ${resolvedUrl}`);
    }

    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(resolvedUrl, {
      method,
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeoutId);

    const contentType = res.headers.get("content-type");
    const duration = Date.now() - startTime;

    // ✅ SAFE: Read text first, never direct .json()
    let text: string;
    try {
      text = await res.text();
    } catch (e: any) {
      logError("[lyg-client] Failed to read response body:", e.message);
      text = "";
    }

    // ✅ Log the response
    console.log(`[LYG] <- ${res.status} ${method} ${resolvedUrl}`);

    let data: T | undefined;
    let precisionWarning = false;
    if (!returnText && text) {
      try {
        const parsed = safeLygJsonParse(text);
        data = parsed.data as T;
        precisionWarning = parsed.precisionWarning;
      } catch (e: any) {
        debug("[lyg-client] Failed to parse JSON:", e.message);
      }
    }

    // Success case
    if (res.ok) {
      return {
        ok: true,
        status: res.status,
        statusText: res.statusText || undefined,
        headers: Object.fromEntries(res.headers.entries()),
        data: returnText ? (text as any) : data,
        text,
        contentType,
        resolvedUrl,
        duration,
        meta: {
          precisionWarning,
        },
      };
    }

    // Error case: capture diagnostics
    const bodySnippet = text.slice(0, 500);
    const hints: string[] = [];

    if (res.status === 401 || res.status === 403) {
      hints.push("Token invalid or expired. Check LYG_TOKEN.");
    } else if (res.status === 404) {
      hints.push(
        "Endpoint not found. Check path and LYG_BASE_URL (double /api?)."
      );
    } else if (res.status === 405) {
      hints.push(`Method ${method} not allowed for this endpoint.`);
    } else if (res.status === 400) {
      hints.push("Invalid request. Check parameters.");
    } else if (res.status >= 500) {
      hints.push("LYG server error. Contact support.");
    }

    // Detect TLS/SSL issues
    if (
      bodySnippet.includes("SSL") ||
      bodySnippet.includes("packet length") ||
      bodySnippet.includes("ERR_SSL")
    ) {
      hints.push(
        "TLS/SSL error: base URL seems incorrect (HTTP vs HTTPS). Check LYG_BASE_URL."
      );
    }

    // Non-JSON response
    if (contentType && !contentType.includes("json")) {
      hints.push(`Content-Type is not JSON: ${contentType}`);
    }

    return {
      ok: false,
      status: res.status,
      statusText: res.statusText || undefined,
      headers: Object.fromEntries(res.headers.entries()),
      text,
      contentType,
      error: `HTTP ${res.status}: ${res.statusText}`,
      resolvedUrl,
      duration,
      data: returnText ? (text as any) : undefined,
    };
  } catch (err: any) {
    const duration = Date.now() - startTime;
    logError("[lyg-client] FETCH_ERROR:", err.message);
    console.error(`[LYG] <- ERROR ${method} ${resolvedUrl}:`, err.message);

    let error = err.message;
    let status = 0;

    // Timeout
    if (err.name === "AbortError") {
      error = `Timeout (${timeoutMs}ms)`;
      status = 408;
    }

    // Network error
    if (err.message.includes("fetch failed")) {
      error = "Fetch failed (network error)";
      status = 0;
    }

    return {
      ok: false,
      status,
      headers: {},
      error,
      duration,
    };
  }
}

/**
 * Fetch JSON from LYG.
 */
export async function lygFetchJson<T = any>(
  path: string,
  opts?: { timeoutMs?: number }
): Promise<LygResponse<T>> {
  return lyFetch<T>(path, { ...opts, method: "GET" });
}

/**
 * Fetch text from LYG (for debugging non-JSON responses).
 */
export async function lygFetchText(
  path: string,
  opts?: { timeoutMs?: number }
): Promise<LygResponse<string>> {
  return lyFetch<string>(path, { ...opts, method: "GET", returnText: true });
}

/**
 * Get LYG family members.
 *
 * ✅ CRITICAL CHANGES:
 * - Uses SINGLE endpoint: /api/darkrp/familles/esperados/members
 * - Ignores familyId parameter (forces FAMILY_SLUG)
 * - Logs [LYG] -> GET url and [LYG] <- status GET url
 * - Safe JSON parsing with res.text() + JSON.parse
 */
export async function fetchLygMembers(
  familyIdParam?: string,
  opts?: { timeoutMs?: number }
): Promise<LygResponse<LygMember[]>> {
  // Warn if non-slug familyId received
  if (familyIdParam && familyIdParam !== FAMILY_SLUG) {
    console.warn("[lyg-members] Ignoring non-slug familyId parameter", {
      received: familyIdParam,
      forced: FAMILY_SLUG,
    });
    debug("[lyg-members] Forced slug", {
      received: familyIdParam,
      forced: FAMILY_SLUG,
    });
  }

  console.log("[lyg-members] Fetching", {
    endpoint: LYG_MEMBERS_ENDPOINT,
    familySlug: FAMILY_SLUG,
  });

  const res = await lyFetch<any>(LYG_MEMBERS_ENDPOINT, {
    method: "GET",
    timeoutMs: opts?.timeoutMs,
  });

  if (!res.ok) {
    console.error("[lyg-members] WARN: fetch failed", {
      status: res.status,
      endpoint: LYG_MEMBERS_ENDPOINT,
      error: res.error,
    });
    return {
      ok: false,
      status: res.status,
      headers: res.headers,
      error: res.error,
      text: res.text,
      contentType: res.contentType,
      resolvedUrl: res.resolvedUrl,
      duration: res.duration,
    };
  }

  // Extract array from response
  const parsedData = res.data ?? res.text;
  if (!parsedData) {
    console.error("[lyg-members] WARN: no response data", {
      status: res.status,
      endpoint: LYG_MEMBERS_ENDPOINT,
    });
    return {
      ok: false,
      status: res.status,
      headers: res.headers,
      error: "No response data",
      resolvedUrl: res.resolvedUrl,
      duration: res.duration,
    };
  }

  const { array: extracted, chosenKey } = extractArrayFromLygResponse(
    parsedData,
    res.contentType
  );

  // Validate and normalize members
  let skippedInvalid = 0;
  const validated = extracted
    .map((item) => {
      const normalized = normalizeLygMember(item, FAMILY_SLUG);
      if (normalized === null) {
        skippedInvalid++;
        return null;
      }

      // Accept steamId64 if it's 17 digits
      if (
        !normalized.steamId64 ||
        !/^[0-9]{17}$/.test(normalized.steamId64)
      ) {
        console.warn(
          `[lyg-members] REJECTED: Invalid steamId64 format: "${normalized.steamId64}"`
        );
        skippedInvalid++;
        return null;
      }

      return normalized;
    })
    .filter((n): n is LygMember => n !== null);

  debug("[lyg-members] Extraction summary", {
    endpoint: LYG_MEMBERS_ENDPOINT,
    extracted: extracted.length,
    validated: validated.length,
    rejected: skippedInvalid,
    chosenKey,
  });

  // Log extraction results
  console.log("[lyg-members] EXTRACTION SUMMARY", {
    extracted: extracted.length,
    validated: validated.length,
    rejected_steamId: skippedInvalid,
    chosenKey,
  });

  if (extracted.length === 0) {
    console.warn("[lyg-members] EXTRACTION FAILED: No members extracted", {
      endpoint: LYG_MEMBERS_ENDPOINT,
      contentType: res.contentType,
      status: res.status,
      hint: "Check API response structure (should have members array)",
    });
  } else if (validated.length === 0 && extracted.length > 0) {
    console.warn(
      "[lyg-members] VALIDATION FAILED: Extracted members but all had invalid steamIds",
      {
        extracted: extracted.length,
        rejected_steamId: skippedInvalid,
        chosenKey,
        hint: "Check that steamId field exists and is 17-digit format",
      }
    );
  }

  return {
    ok: true,
    status: res.status,
    headers: res.headers,
    data: validated,
    contentType: res.contentType,
    resolvedUrl: res.resolvedUrl,
    duration: res.duration,
    meta: {
      url: res.resolvedUrl,
      status: res.status,
      contentType: res.contentType,
      durationMs: res.duration,
      rootKeys: typeof parsedData === "object" ? Object.keys(parsedData) : [],
      extractedCount: extracted.length,
      skippedInvalid,
      chosenKey,
      urlUsed: res.resolvedUrl,
      precisionWarning: res.meta?.precisionWarning ?? false,
    },
  };
}

/**
 * Get LYG family banklogs.
 *
 * ✅ Uses family name endpoint (LYG expects familyName for banklogs)
 */
export async function fetchLygBanklogs(
  familyIdParam?: string,
  opts?: { timeoutMs?: number }
): Promise<LygResponse<any[]>> {
  // Warn if non-slug familyId received
  if (familyIdParam && familyIdParam !== FAMILY_SLUG) {
    console.warn("[lyg-banklogs] Ignoring non-slug familyId parameter", {
      received: familyIdParam,
      forced: FAMILY_SLUG,
    });
  }

  const path = LYG_BANKLOGS_ENDPOINT_PRIMARY;

  const res = await lyFetch<any>(path, {
    method: "GET",
    timeoutMs: opts?.timeoutMs,
  });

  console.log("[lyg-banklogs] endpointUsed", {
    endpoint: path,
    resolvedUrl: res.resolvedUrl,
  });

  if (!res.ok) {
    console.error("[lyg-banklogs] WARN: fetch failed", {
      status: res.status,
      endpoint: path,
      resolvedUrl: res.resolvedUrl,
      error: res.error,
    });

    // Specific handling for 404
    if (res.status === 404) {
      return {
        ok: false,
        status: res.status,
        headers: res.headers,
        error: "LYG_BANKLOGS_404",
        text: res.text,
        contentType: res.contentType,
        resolvedUrl: res.resolvedUrl,
        duration: res.duration,
      };
    }

    return {
      ok: false,
      status: res.status,
      headers: res.headers,
      error: res.error,
      text: res.text,
      contentType: res.contentType,
      resolvedUrl: res.resolvedUrl,
      duration: res.duration,
    };
  }

  console.log("[lyg-banklogs] Fetch success", {
    status: res.status,
    endpoint: path,
    resolvedUrl: res.resolvedUrl,
  });

  // Extract array from response
  const { array: extracted, chosenKey } = extractArrayFromLygResponse(
    res.data ?? res.text,
    res.contentType
  );

  const rootKeys =
    res.data && typeof res.data === "object" && !Array.isArray(res.data)
      ? Object.keys(res.data)
      : [];

  return {
    ok: true,
    status: res.status,
    headers: res.headers,
    data: extracted,
    contentType: res.contentType,
    resolvedUrl: res.resolvedUrl,
    duration: res.duration,
    meta: {
      url: res.resolvedUrl,
      status: res.status,
      contentType: res.contentType,
      durationMs: res.duration,
      rootKeys,
      extractedCount: extracted.length,
      chosenKey,
      urlUsed: res.resolvedUrl,
    },
  };
}

/**
 * Legacy compatibility functions (now using single endpoint).
 */
export function familyMembersPath(familyId: string): string {
  return LYG_MEMBERS_ENDPOINT;
}

export function familyBankLogsPath(familyId: string): string {
  return LYG_BANKLOGS_ENDPOINT_PRIMARY;
}

/**
 * Get LYG endpoint diagnostics (legacy).
 */
export function getLygEndpointDiagnostics() {
  return [
    {
      kind: "members",
      endpoint: LYG_MEMBERS_ENDPOINT,
      familySlug: FAMILY_SLUG,
    },
    {
      kind: "banklogs",
      endpoint: LYG_BANKLOGS_ENDPOINT_PRIMARY,
      familySlug: FAMILY_SLUG,
    },
  ];
}

/**
 * Get body snippet helper (for error messages).
 */
export function getBodySnippet(text: string | undefined, maxLen = 500): string {
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen) + "..." : text;
}

/**
 * Legacy export name for compatibility.
 */
export const lygFetchMembers = fetchLygMembers;

// ─── Player info (/api/players/:steamid) ─────────────────────────────────────

export interface LygPlayerInfo {
  steamid: string;
  last_name: string;
  discordid: string;
  coins: number;
  connected: boolean;
}

export async function fetchLygPlayer(
  steamId: string,
  opts?: { timeoutMs?: number }
): Promise<LygResponse<LygPlayerInfo>> {
  const res = await lyFetch<any>(`/api/players/${steamId}`, opts);
  if (res.ok && res.data) {
    const raw = res.data?.data ?? res.data;
    const playerData: LygPlayerInfo = { ...raw, connected: Boolean(raw?.connected) };
    return { ...res, data: playerData };
  }
  return { ...res, data: undefined };
}

// ─── Warns (/api/warns/:steamid64) ───────────────────────────────────────────

export interface LygWarn {
  reason: string;
  type: string;
  date: string;
  expired: boolean;
}

export interface LygWarnsResponse {
  data: LygWarn[];
  total: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
}

export async function fetchLygWarns(
  steamId64: string,
  opts?: { timeoutMs?: number; page?: number; limit?: number }
): Promise<LygResponse<LygWarnsResponse>> {
  const params = new URLSearchParams();
  if (opts?.page)  params.set("page",  String(opts.page));
  if (opts?.limit) params.set("limit", String(opts.limit));
  const query = params.toString();
  const path  = `/api/warns/${steamId64}${query ? `?${query}` : ""}`;
  const res   = await lyFetch<LygWarnsResponse>(path, { timeoutMs: opts?.timeoutMs });
  return res;
}

/**
 * Fetch family endpoint text (legacy compatibility - now uses single endpoint).
 * This function is used by lyg-banklogs.ts for compatibility.
 */
export async function fetchFamilyEndpointText(
  kind: "members" | "banklogs",
  familyId: string,
  opts?: { timeoutMs?: number; query?: Record<string, string> }
): Promise<any> {
  let endpoint: string;
  if (kind === "members") {
    endpoint = LYG_MEMBERS_ENDPOINT;
  } else {
    // For banklogs, use FAMILY_NAME endpoint
    endpoint = LYG_BANKLOGS_ENDPOINT_PRIMARY;
  }
  
  const res = await lyFetch<string>(endpoint, {
    method: "GET",
    timeoutMs: opts?.timeoutMs,
    returnText: true,
  });

  return {
    ...res,
    pathUsed: endpoint,
    tested: [endpoint],
  };
}
