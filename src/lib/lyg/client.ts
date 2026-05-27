import { getLygConfig } from "@/lib/lyg";
import { recordLygCall, normalizeLygEndpoint } from "@/lib/lyg-stats";

export type LygMember = {
  steamId64: string;
  family?: string;
  rank?: string;
  owner?: boolean;
  rpName?: string;
  grade?: string;
  joinedAt?: unknown;
  isActive?: boolean;
  discordId?: string;
};

export type LygHttpResult<T = unknown> = {
  ok: boolean;
  status: number;
  url: string;
  durationMs: number;
  data?: T;
  text?: string;
  error?: string;
};

function extractArrayFromLygResponse(response: unknown): { array: unknown[]; chosenKey: string } {
  if (Array.isArray(response)) {
    return { array: response, chosenKey: "direct" };
  }

  if (!response || typeof response !== "object") {
    return { array: [], chosenKey: "invalid" };
  }

  const candidate = response as Record<string, unknown>;
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
  ];

  for (const key of preferredKeys) {
    if (Array.isArray(candidate[key])) {
      return { array: candidate[key] as unknown[], chosenKey: `preferred:${key}` };
    }
  }

  return { array: [], chosenKey: "none" };
}

function normalizeLygMember(item: unknown, defaultFamily: string): LygMember | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  const record = item as Record<string, unknown>;
  let steamIdRaw =
    record.steamId64 ??
    record.steamid64 ??
    record.steam_id64 ??
    record.steamID64 ??
    record.steamIdRaw ??
    record.steamid ??
    record.steamId ??
    record.steam_id ??
    record.playerSteamId ??
    record.player_steam_id ??
    record.steam_id_raw ??
    record.id;

  let steamId64 = String(steamIdRaw ?? "").trim();

  if (steamId64.includes("e") && steamId64.includes("+")) {
    const numValue = Number.parseFloat(steamId64);
    if (Number.isFinite(numValue) && Number.isSafeInteger(numValue)) {
      steamId64 = String(Math.floor(numValue));
    }
  }

  if (!/^\d{17}$/.test(steamId64)) {
    return null;
  }

  const family = record.family ?? record.familyName ?? defaultFamily ?? "unknown";
  const rank = record.class ?? record.rank ?? record.grade ?? record.type ?? null;
  const owner = record.owner ?? record.isOwner ?? record.ownerFlag ?? false;

  return {
    steamId64,
    family: String(family),
    rank: rank ? String(rank) : undefined,
    owner: Boolean(owner),
    rpName: (record.rpName ?? record.name ?? record.nomRP ?? record.username) as string | undefined,
    grade:
      record.grade != null
        ? String(record.grade)
        : record.rank != null
          ? String(record.rank)
          : undefined,
    joinedAt: record.joinedAt ?? record.joined_at ?? record.createdAt,
    isActive: (record.isActive ?? record.active ?? true) as boolean,
    discordId: (record.discordId ?? record.discord_id) as string | undefined,
  };
}

function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  let normalizedPath = path;
  if (base.endsWith("/api") && path.startsWith("/api/")) {
    normalizedPath = path.slice(4);
  }
  const prefix = normalizedPath.startsWith("/") ? "" : "/";
  return `${base}${prefix}${normalizedPath}`;
}

function mapError(status: number): string {
  if (status === 401 || status === 403) return "Token invalide";
  if (status === 404) return "Route LYG introuvable";
  if (status === 429) return "Rate limit LYG";
  if (status >= 500 || status === 0) return "LYG indisponible";
  return `LYG error ${status}`;
}

async function request<T = unknown>(path: string, timeoutMs = 15_000): Promise<LygHttpResult<T>> {
  const cfg = getLygConfig();
  const startedAt = Date.now();
  const url = joinUrl(cfg.baseUrl, path);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  console.log("[LYG_SYNC][HTTP] start", { method: "GET", url, timeoutMs });

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        // LYG a basculé son auth de Bearer vers X-API-Token (printemps 2026).
        // Voir doc : "Toutes les routes nécessitent un header X-API-Token ou ?token="
        "X-API-Token": cfg.token,
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "los-esperados-panel-sync/1.0",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    const text = await res.text().catch(() => "");
    const durationMs = Date.now() - startedAt;

    // Track : on compte tous les calls LYG passant par ce client (auto-sync
    // members + banklogs). Sans ça la box Système ignorait les crons.
    try {
      recordLygCall({ ok: res.ok, status: res.status, endpoint: normalizeLygEndpoint(path) });
    } catch {
      // tracking non bloquant
    }

    if (!res.ok) {
      const mapped = mapError(res.status);
      console.error("[LYG_SYNC][HTTP] error", {
        url,
        status: res.status,
        mapped,
        durationMs,
      });
      return {
        ok: false,
        status: res.status,
        url,
        durationMs,
        text,
        error: mapped,
      };
    }

    let data: T | undefined;
    try {
      data = (text ? JSON.parse(text) : {}) as T;
    } catch {
      data = undefined;
    }

    console.log("[LYG_SYNC][HTTP] ok", { url, status: res.status, durationMs });
    return {
      ok: true,
      status: res.status,
      url,
      durationMs,
      text,
      data,
    };
  } catch (err: any) {
    const durationMs = Date.now() - startedAt;
    const error = err?.name === "AbortError" ? "LYG indisponible (timeout)" : String(err?.message ?? err);
    console.error("[LYG_SYNC][HTTP] exception", { url, error, durationMs });
    // Track aussi les exceptions (timeout / network) — status=0 pour les distinguer.
    try {
      recordLygCall({ ok: false, status: 0, endpoint: normalizeLygEndpoint(path) });
    } catch {
      // ignore
    }
    return {
      ok: false,
      status: 0,
      url,
      durationMs,
      error,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchMembersPage(): Promise<LygHttpResult<LygMember[]>> {
  const familySlug = "esperados";
  // LYG paginate par défaut à 20 — on demande 150 (max constaté) pour
  // récupérer toute la famille en un seul call. Si la famille grossit
  // au-delà de 150, il faudra paginer (voir totalPages dans la réponse).
  const path = `/api/darkrp/familles/${familySlug}/members?limit=150`;
  const res = await request<any>(path, 60_000);

  if (!res.ok || !res.data) {
    return { ...res, data: undefined };
  }

  const { array } = extractArrayFromLygResponse(res.data);
  const normalized = (array || [])
    .map((item) => normalizeLygMember(item, familySlug))
    .filter((it): it is LygMember => Boolean(it));

  return {
    ...res,
    data: normalized,
  };
}

export async function fetchBanklogsPage(page: number, limit: number): Promise<LygHttpResult<any[]>> {
  const familyName = process.env.LYG_FAMILY_NAME || "Los Esperados";
  const path = `/api/darkrp/familles/${encodeURIComponent(familyName)}/banklogs?limit=${limit}&page=${page}`;
  const res = await request<any>(path, 15_000);

  if (!res.ok || !res.data) {
    return { ...res, data: undefined };
  }

  const { array } = extractArrayFromLygResponse(res.data);
  return {
    ...res,
    data: Array.isArray(array) ? array : [],
  };
}
