import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * GET /api/member/staff-online — staff LYG actuellement connectés en jeu
 * (proxy de https://liveyourgame.link/api/staff/staffonline.php).
 * Cache mémoire 60 s : les dashboards rafraîchissent sans marteler LYG.
 */

const LYG_URL = "https://liveyourgame.link/api/staff/staffonline.php";
const CACHE_MS = 30_000;

type StaffOnline = {
  name: string;
  rankStaff: string;
  rankVip: string;
  server: number | null;
  job: string;
};

let cache: { at: number; data: StaffOnline[] } | null = null;

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json({ ok: true, data: cache.data, cachedAt: cache.at });
  }

  try {
    const res = await fetch(LYG_URL, {
      headers: { "user-agent": "Mozilla/5.0 (LosEsperados-Panel)" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const json = await res.json();
    if (json?.status !== "success" || !Array.isArray(json.data)) {
      throw new Error("réponse LYG inattendue");
    }
    const data: StaffOnline[] = json.data
      // > 0 et non === 1 : le n° de serveur est porté par staff_server, pas par
      // connected. Si LYG émet un jour connected=2 pour un staff bien en jeu,
      // === 1 le masquerait silencieusement (faux négatif). > 0 exclut juste 0.
      .filter((p: any) => Number(p?.connected) > 0)
      .map((p: any) => ({
        name: String(p.last_name ?? "?"),
        rankStaff: String(p.rank_staff ?? ""),
        rankVip: String(p.rank_vip ?? ""),
        server: p.staff_server != null ? Number(p.staff_server) : null,
        job: String(p.job ?? ""),
      }));
    cache = { at: Date.now(), data };
    return NextResponse.json({ ok: true, data, cachedAt: cache.at });
  } catch {
    // LYG down : on sert le dernier état connu plutôt que rien.
    if (cache) {
      return NextResponse.json({ ok: true, data: cache.data, cachedAt: cache.at, stale: true });
    }
    return NextResponse.json({ ok: false, error: "LYG_UNREACHABLE" }, { status: 200 });
  }
}
