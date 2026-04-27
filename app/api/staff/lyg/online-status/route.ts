import { NextResponse } from "next/server";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { fetchLygPlayer } from "@/lib/lyg-client";

type CachedStatus = { connected: boolean; last_name: string | null; coins: number | null };

// In-memory cache: steamId -> { value, expiresAt }
const cache = new Map<string, { value: CachedStatus; expiresAt: number }>();
const CACHE_TTL_MS = 5 * 60_000; // 5min par steamId

function getCached(steamId: string): CachedStatus | null {
  const entry = cache.get(steamId);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { cache.delete(steamId); return null; }
  return entry.value;
}

function setCache(steamId: string, value: CachedStatus) {
  cache.set(steamId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

// Fetch with a small delay between each call to avoid hammering the LYG API
async function fetchSequential(steamIds: string[], delayMs = 150): Promise<void> {
  for (const steamId of steamIds) {
    try {
      const res = await fetchLygPlayer(steamId);
      if (res.ok && res.data) {
        setCache(steamId, {
          connected: Boolean(res.data.connected),
          last_name: res.data.last_name ?? null,
          coins: res.data.coins ?? null,
        });
      } else {
        setCache(steamId, { connected: false, last_name: null, coins: null });
      }
    } catch {
      setCache(steamId, { connected: false, last_name: null, coins: null });
    }
    if (steamIds.indexOf(steamId) < steamIds.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

export async function GET(req: Request) {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("steamIds") ?? "";
  const steamIds = raw.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 80);

  if (steamIds.length === 0) {
    return NextResponse.json({ ok: true, data: {} });
  }

  // Serve cached immediately, fetch only stale ones
  const stale = steamIds.filter((id) => !getCached(id));
  if (stale.length > 0) {
    // Run in background — don't block the response
    void fetchSequential(stale, 200);
  }

  // Build response from cache (stale ones will show up on next call)
  const data: Record<string, CachedStatus> = {};
  for (const steamId of steamIds) {
    data[steamId] = getCached(steamId) ?? { connected: false, last_name: null, coins: null };
  }

  return NextResponse.json({ ok: true, data });
}
