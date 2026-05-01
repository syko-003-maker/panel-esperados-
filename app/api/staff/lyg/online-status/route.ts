import { NextResponse } from "next/server";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { ensureOnlineStatusLoopStarted, onlineStatusCache } from "@/lib/online-status-loop";

export async function GET(req: Request) {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  // Démarrer le loop en arrière-plan si pas déjà fait
  ensureOnlineStatusLoopStarted();

  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("steamIds") ?? "";
  const STEAM_ID_RE = /^\d{17}$/;
  const steamIds = raw.split(",").map((s) => s.trim()).filter((s) => STEAM_ID_RE.test(s)).slice(0, 200);

  const data: Record<string, { connected: boolean; last_name: string | null; coins: number | null }> = {};
  for (const steamId of steamIds) {
    const c = onlineStatusCache.get(steamId);
    data[steamId] = c
      ? { connected: c.connected, last_name: c.last_name, coins: c.coins }
      : { connected: false, last_name: null, coins: null };
  }

  return NextResponse.json({ ok: true, data });
}
