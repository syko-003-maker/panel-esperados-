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
  options?: { timeoutMs?: number },
): Promise<FamilyPlaytimeEntry[]> {
  const { timeoutMs = 30_000 } = options ?? {};
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
        // ✅ FIX: Use minutes elapsed since Monday 00:00 Brussels time so the LYG query
        // returns data for the CURRENT week only (not a rolling 7-day window).
        // Previously hardcoded to 10080 (7 days), which kept last week's playtime
        // visible all through the new week — members who stopped playing were never
        // absent from the snapshot and therefore never reset to 0.
        // getMinutesSinceWeekStart() was defined here but never wired up — now it is.
        time: Math.max(1, getMinutesSinceWeekStart().minutes),
      }),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error(`LYG playtime request timed out after ${timeoutMs}ms`);
    }
    throw new Error(`LYG playtime network error: ${err?.message ?? String(err)}`);
  } finally {
    clearTimeout(timeout);
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
