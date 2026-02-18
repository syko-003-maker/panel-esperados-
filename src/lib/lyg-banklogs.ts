import { debug, error as logError } from "@/lib/logger";
import { extractArrayFromLygResponse } from "@/lib/lyg-client";

export type LygBanklogsResult = {
  ok: boolean;
  status: number;
  data?: any;
  text?: string;
  url?: string;
  error?: string;
  durationMs?: number;
  meta?: {
    urlUsed?: string;
    status?: number;
    contentType?: string;
    durationMs?: number;
    rootKeys?: string[];
    extractedCount?: number;
    chosenKey?: string;
  };
};

function mapLygError(status: number): string {
  if (status === 401 || status === 403) return "Token invalide";
  if (status === 404) return "Route LYG introuvable";
  if (status === 429) return "Rate limit LYG";
  if (status >= 500 || status === 0) return "LYG indisponible";
  return `LYG error ${status}`;
}

function getLygConfig() {
  const base = process.env.LYG_BASE_URL;
  const token = process.env.LYG_TOKEN;
  if (!base) throw new Error("LYG_BASE_URL missing");
  if (!token) throw new Error("LYG_TOKEN missing");
  return { base, token };
}

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  let normalizedPath = path;
  if (base.endsWith("/api") && path.startsWith("/api/")) {
    normalizedPath = path.slice(4);
  }
  const pathPrefix = normalizedPath.startsWith("/") ? "" : "/";
  return `${base}${pathPrefix}${normalizedPath}`;
}

/**
 * Fetch LYG banklogs using FAMILY_NAME endpoint.
 */
export async function fetchLygBanklogs(
  familyId?: string,
  opts?: { timeoutMs?: number }
): Promise<LygBanklogsResult> {
  const start = Date.now();
  const timeoutMs = opts?.timeoutMs ?? 15_000;

  const config = getLygConfig();
  const familyName = process.env.LYG_FAMILY_NAME || "Los Esperados";
  const endpoint = `/api/darkrp/familles/${encodeURIComponent(familyName)}/banklogs`;

  if (familyId && familyId !== "esperados") {
    console.warn("[lyg-banklogs] Ignoring non-slug familyId, using fixed endpoint", {
      received: familyId,
      enforced: "esperados",
    });
  }

  try {
    const url = joinUrl(config.base, endpoint);

    console.log(`[lyg-banklogs] -> GET ${url}`);
    debug("[lyg-banklogs] fetching", { url, timeoutMs });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeoutId);

    const contentType = res.headers.get("content-type") || "";
    const text = await res.text().catch(() => "");
    const durationMs = Date.now() - start;

    console.log(`[lyg-banklogs] <- ${res.status} ${res.statusText || ""}`);
    console.log("[lyg-banklogs] endpointUsed", { endpoint, resolvedUrl: url });
    debug("[lyg-banklogs] response", { status: res.status, contentType, durationMs });

    if (!res.ok) {
      const message = mapLygError(res.status);
      logError("[lyg-banklogs] fetch failed", {
        status: res.status,
        message,
        url,
      });
      return {
        ok: false,
        status: res.status,
        text,
        url,
        error: message,
        durationMs,
        meta: {
          urlUsed: url,
          status: res.status,
          contentType,
          durationMs,
        },
      };
    }

    let data: any;
    try {
      data = text ? JSON.parse(text) : {};
    } catch (e) {
      console.warn("[lyg-banklogs] Parse error", { error: String(e) });
      data = { raw: text };
    }

    const { array: extracted, chosenKey } = extractArrayFromLygResponse(
      data,
      contentType
    );

    const rootKeys =
      data && typeof data === "object" && !Array.isArray(data)
        ? Object.keys(data)
        : [];

    return {
      ok: true,
      status: res.status,
      data,
      text,
      url,
      durationMs,
      meta: {
        urlUsed: url,
        status: res.status,
        contentType,
        durationMs,
        rootKeys,
        extractedCount: extracted.length,
        chosenKey,
      },
    };
  } catch (err: any) {
    const message = err?.name === "AbortError"
      ? "LYG indisponible (timeout)"
      : String(err?.message ?? err);

    logError("[lyg-banklogs] request failed", { message });

    return {
      ok: false,
      status: 0,
      error: message,
      durationMs: Date.now() - start,
    };
  }
}

