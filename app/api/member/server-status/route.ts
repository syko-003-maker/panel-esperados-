import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { queryA2SInfo, getLygGameServers } from "@/lib/lyg/a2s";

/**
 * GET /api/member/server-status — joueurs EN DIRECT sur le(s) serveur(s) GMod
 * DarkRP de LYG, via requête A2S (Steam) directement sur le serveur de jeu.
 * Accessible à tout membre connecté. On somme les joueurs des serveurs du
 * cluster (1 + 2 synchronisés) qui répondent. Cache mémoire 30 s → les
 * dashboards rafraîchissent sans multiplier les requêtes UDP.
 *
 * Node runtime obligatoire (node:dgram).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_MS = 10_000;

type ServerEntry = {
  ok: boolean;
  name: string | null;
  map: string | null;
  players: number | null;
  max: number | null;
};
type Payload = {
  ok: true;
  online: boolean;
  /** Compteur affiché = serveur principal joignable (ex. 59/180). */
  players: number;
  max: number;
  name: string | null;
  map: string | null;
  /** Somme des joueurs sur tous les serveurs joignables du cluster (référence). */
  totalPlayers: number;
  servers: ServerEntry[];
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

  const servers = getLygGameServers();
  const results = await Promise.all(servers.map((s) => queryA2SInfo(s.host, s.port)));
  const up = results.filter((r) => r.ok);
  // Tête d'affiche = 1er serveur joignable dans l'ordre de priorité (le principal
  // « Famille | LYG », 180 slots). C'est le X/180 que montrent metricsgame / le bot.
  const headline = up[0] ?? null;

  const payload: Payload = {
    ok: true,
    online: up.length > 0,
    players: headline?.players ?? 0,
    max: headline?.max ?? 0,
    name: headline?.name ?? null,
    map: headline?.map ?? null,
    totalPlayers: up.reduce((sum, r) => sum + (r.players ?? 0), 0),
    servers: results.map((r) => ({
      ok: r.ok,
      name: r.ok ? r.name ?? null : null,
      map: r.ok ? r.map ?? null : null,
      players: r.ok ? r.players ?? null : null,
      max: r.ok ? r.max ?? null : null,
    })),
  };

  // Tous les serveurs muets sur ce poll (probable perte UDP transitoire, un
  // hoquet DNS, ou un lag simultané) : on NE clobber PAS un bon cache récent —
  // on ressert le dernier état « en ligne » plutôt que de masquer le bandeau
  // 30 s pour tout le monde. Au-delà de STALE_MAX_MS, on laisse passer l'état
  // hors-ligne (serveur réellement down).
  const STALE_MAX_MS = 3 * 60_000;
  if (!payload.online && cache?.payload.online && Date.now() - cache.at < STALE_MAX_MS) {
    return NextResponse.json({ ...cache.payload, stale: true, cachedAt: cache.at });
  }

  cache = { at: Date.now(), payload };
  return NextResponse.json({ ...payload, cachedAt: cache.at });
}
