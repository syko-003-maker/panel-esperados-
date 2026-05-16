import { recordLygCall } from "@/lib/lyg-stats";

export type FamilyPlaytimeEntry = {
  steamId: string;
  playtime7d: number;
};

const BRUSSELS_TIMEZONE = "Europe/Brussels";

type WeekStartComputation = {
  now: Date;
  weekStart: Date;
  minutes: number;
};

function toSteamId(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }

  return null;
}

function toMinutes(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed));
    }
  }

  return 0;
}

export function getMinutesSinceWeekStart(
  now: Date = new Date(),
  timeZone: string = BRUSSELS_TIMEZONE
): WeekStartComputation {
  const localized = new Date(now.toLocaleString("en-US", { timeZone }));
  const weekStart = new Date(localized);
  const day = weekStart.getDay();
  const daysSinceMonday = (day + 6) % 7;
  weekStart.setDate(weekStart.getDate() - daysSinceMonday);
  weekStart.setHours(0, 0, 0, 0);

  const elapsedMinutes = Math.floor((localized.getTime() - weekStart.getTime()) / 60000);

  return {
    now,
    weekStart,
    minutes: Math.max(0, elapsedMinutes),
  };
}

export async function fetchFamilyPlaytimes7d(
  token: string,
  options?: { timeoutMs?: number; timeMinutes?: number },
): Promise<FamilyPlaytimeEntry[]> {
  // `timeMinutes` permet d'override la fenêtre. Si non fourni, on utilise
  // les minutes depuis le lundi 00:00 Brussels (cumulé semaine en cours).
  // Pour un poll court "qui est en métier famille là maintenant", passer
  // timeMinutes: 3 (= playtime dans les 3 dernières minutes).
  const { timeoutMs = 30_000, timeMinutes } = options ?? {};
  let base = process.env.LYG_BASE_URL?.trim();
  if (!base) {
    throw new Error("LYG_BASE_URL is missing");
  }

  if (!/^https?:\/\//i.test(base)) {
    base = `https://${base}`;
  }

  while (base.endsWith("/")) {
    base = base.slice(0, -1);
  }

  if (!base.endsWith("/api")) {
    base += "/api";
  }

  const endpoint = `${base}/darkrp/familles/playtimes`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  // Endpoint normalisé pour le tracking (tous les appels passent par la même
  // route LYG — un seul bucket dans la box "Par endpoint").
  const trackedEndpoint = "/darkrp/familles/playtimes";

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        token,
        // Si timeMinutes est passé explicitement → fenêtre courte (ex: 3 min
        // pour le poll "in-family"). Sinon → minutes depuis lundi 00:00
        // Brussels = cumulé semaine en cours (cas 7d sync historique).
        time: typeof timeMinutes === "number" && Number.isFinite(timeMinutes) && timeMinutes > 0
          ? Math.max(1, Math.floor(timeMinutes))
          : Math.max(1, getMinutesSinceWeekStart().minutes),
      }),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err: any) {
    // Track les network errors (status=0) pour aligner avec le compteur global.
    try {
      recordLygCall({ ok: false, status: 0, endpoint: trackedEndpoint });
    } catch {
      /* ignore */
    }
    if (err?.name === "AbortError") {
      throw new Error(`LYG playtime request timed out after ${timeoutMs}ms`);
    }
    throw new Error(`LYG playtime network error: ${err?.message ?? String(err)}`);
  } finally {
    clearTimeout(timeout);
  }

  // Track le call (cron playtime auto-sync, 1×/heure).
  try {
    recordLygCall({ ok: res.ok, status: res.status, endpoint: trackedEndpoint });
  } catch {
    /* tracking non bloquant */
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) {
      throw new Error(`LYG playtime authentication failed (${res.status}) — check LYG_TOKEN`);
    }
    if (res.status === 429) {
      throw new Error(`Rate limit LYG playtime (${res.status}): ${text.slice(0, 300)}`);
    }
    throw new Error(`LYG playtime request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error("LYG playtime response is not valid JSON");
  }
  const rawRows = Array.isArray(body)
    ? body
    : Array.isArray((body as any)?.data)
      ? (body as any).data
      : Array.isArray((body as any)?.members)
        ? (body as any).members
        : (body as any)?.data && typeof (body as any).data === "object"
          ? Object.entries((body as any).data).map(([steamId, playtime7d]) => ({ steamId, playtime7d }))
          : [];

  const map = new Map<string, number>();

  for (const row of rawRows) {
    const steamId = toSteamId((row as any)?.steamId64 ?? (row as any)?.steamId ?? (row as any)?.steamid64 ?? (row as any)?.steamid);
    if (!steamId) continue;

    const minutes = toMinutes((row as any)?.minutes7d ?? (row as any)?.playtime7d ?? (row as any)?.playtime ?? 0);
    map.set(steamId, minutes);
  }

  return Array.from(map.entries()).map(([steamId, playtime7d]) => ({ steamId, playtime7d }));
}
