import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchFamiliesRanking } from "@/lib/lyg/client";

/**
 * GET /api/member/families-ranking — classement des familles LYG (points +
 * banque), via l'API LYG officielle (`/api/darkrp/familles`). Accessible à
 * tout membre. Classé par points décroissants. Cache 5 min (le classement
 * bouge lentement + on ménage le quota LYG).
 *
 * ⚠️ Les autres colonnes de liveyourgame.fr/stats ne sont PAS récupérables :
 *   - SCORE composite, Braquages, Morts, Or, Cocaïne, Guerres, Réputation →
 *     calculés par le site, 404 sur l'API, page Cloudflare-only.
 *   - Membres → l'API `/familles/{slug}/members` renvoie tout le roster
 *     (ex. esperados 31) ≠ le compte « actif » du site (19) → non affiché
 *     pour ne pas contredire le site.
 * On classe par `points` : le top (Los Esperados #2) correspond, l'ordre peut
 * diverger plus bas.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OUR_FAMILY_ID = "esperados";
const CACHE_MS = 5 * 60_000;

type RankedFamily = {
  rank: number;
  id: string;
  name: string;
  points: number;
  money: number;
  isOurs: boolean;
};
type Payload = {
  ok: true;
  totalFamilies: number;
  ours: RankedFamily | null;
  ranking: RankedFamily[];
};

let cache: { at: number; payload: Payload } | null = null;

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  if (cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json({ ...cache.payload, cachedAt: cache.at });
  }

  const res = await fetchFamiliesRanking();
  if (!res.ok || !res.data || res.data.length === 0) {
    // LYG momentanément indispo → on ressert le dernier cache si on en a un.
    if (cache) {
      return NextResponse.json({ ...cache.payload, stale: true, cachedAt: cache.at });
    }
    return NextResponse.json({ ok: false, error: "LYG_UNAVAILABLE" });
  }

  const sorted = [...res.data].sort((a, b) => b.points - a.points);
  const ranking: RankedFamily[] = sorted.map((f, i) => ({
    rank: i + 1,
    id: f.id,
    name: f.name,
    points: f.points,
    money: f.money,
    isOurs: f.id === OUR_FAMILY_ID,
  }));
  const ours = ranking.find((f) => f.isOurs) ?? null;

  const payload: Payload = { ok: true, totalFamilies: ranking.length, ours, ranking };
  cache = { at: Date.now(), payload };
  return NextResponse.json({ ...payload, cachedAt: cache.at });
}
