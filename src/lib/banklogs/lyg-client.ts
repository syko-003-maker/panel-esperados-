/**
 * Client LYG safe pour /api/banklogs.
 * - joinUrl : assemble base + path en évitant le double `/api`
 * - fetchLygJsonSafe : GET/POST avec auth Bearer, parse JSON tolérant
 *
 * Pas de `.json()` direct (jeté si content-type pas JSON) — on lit le text
 * et on parse explicitement, on remonte le rawText en cas d'échec pour debug.
 *
 * Extrait de app/api/banklogs/route.ts (Lot 8).
 */

import { debug } from "@/lib/logger";
import { safeJsonParse } from "./responses";

/**
 * ⚠️ CRITICAL: Joins base URL + path intelligently.
 * Examples :
 *   base: https://api.lyg.fr,     path: /api/darkrp/...  →  https://api.lyg.fr/api/darkrp/...
 *   base: https://api.lyg.fr/api, path: /api/darkrp/...  →  https://api.lyg.fr/api/darkrp/...  (pas de double /api)
 *   base: https://api.lyg.fr/,    path: api/x            →  https://api.lyg.fr/api/x
 */
export function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  let normalizedPath = path;
  if (base.endsWith("/api") && path.startsWith("/api/")) {
    normalizedPath = path.slice(4); // évite le double /api
  }
  const pathPrefix = normalizedPath.startsWith("/") ? "" : "/";
  return `${base}${pathPrefix}${normalizedPath}`;
}

export function getLygBaseUrl(): string {
  const base = process.env.LYG_BASE_URL;
  if (!base) throw new Error("LYG_BASE_URL missing");
  return base;
}

export function getLygToken(): string {
  const token = process.env.LYG_TOKEN;
  if (!token) throw new Error("LYG_TOKEN missing");
  return token;
}

export interface LygFetchResult<T = unknown> {
  ok: boolean;
  status: number;
  url: string;
  contentType: string;
  rawText: string; // tronqué à 2000 chars pour logs
  json: T | null;
}

export async function fetchLygJsonSafe<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<LygFetchResult<T>> {
  const base = getLygBaseUrl();
  const url = joinUrl(base, path);
  const token = getLygToken();

  const headers = new Headers(init?.headers);
  headers.set("accept", "application/json");
  headers.set("authorization", `Bearer ${token}`);
  if (init?.body && !headers.get("content-type")) {
    headers.set("content-type", "application/json");
  }

  const method = init?.method ?? "GET";
  console.log(`[LYG] -> ${method} ${url}`);
  debug("[LYG] ->", { method, url });

  const res = await fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });

  console.log(`[LYG] <- ${res.status} ${method} ${url}`);
  debug("[LYG] <-", { status: res.status, method, url });

  const contentType = res.headers.get("content-type") || "";
  const rawText = await res.text().catch(() => "");
  const maybeJson =
    contentType.includes("application/json") ? safeJsonParse<T>(rawText) : null;

  return {
    ok: res.ok,
    status: res.status,
    url,
    contentType,
    rawText: rawText ? rawText.slice(0, 2000) : "",
    json: maybeJson,
  };
}
