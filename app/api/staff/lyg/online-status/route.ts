import { NextResponse } from "next/server";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { ensureInFamilyLoopStarted, getInFamilyStatus, isInFamilyWarm } from "@/lib/in-family-loop";

/**
 * GET /api/staff/lyg/online-status?steamIds=...&...
 *
 * Renvoie le statut "en ligne en métier famille" pour chaque steamId.
 * Note : avant on utilisait `connected` (= sur le serveur GMod, peu importe
 * le métier). Maintenant on dérive `connected` du loop in-family, qui regarde
 * le playtime FAMILLE sur les ~3 dernières minutes. Donc "connected:true"
 * signifie : actif en métier famille récemment, pas juste "en jeu".
 *
 * Shape de réponse inchangée pour compat UI :
 *   { ok: true, data: { [steamId]: { connected, last_name, coins } } }
 * Coins n'est plus dispo via cette source → toujours null pour l'instant.
 */
export async function GET(req: Request) {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  // Démarrer le loop in-family s'il ne tourne pas (lazy boot panel)
  ensureInFamilyLoopStarted();

  // Cold start : tant qu'aucun poll n'a réussi, le cache est vide et on ne sait
  // rien. On renvoie une map vide (état "inconnu") pour que l'UI affiche "…"
  // au lieu d'un faux "hors métier" pour tout le monde juste après un déploiement.
  if (!isInFamilyWarm()) {
    return NextResponse.json({ ok: true, data: {}, warming: true });
  }

  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("steamIds") ?? "";
  const STEAM_ID_RE = /^\d{17}$/;
  const steamIds = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => STEAM_ID_RE.test(s))
    .slice(0, 200);

  const data: Record<string, { connected: boolean; last_name: string | null; coins: number | null }> = {};
  for (const steamId of steamIds) {
    const status = getInFamilyStatus(steamId);
    data[steamId] = {
      connected: status.inFamily,
      last_name: status.last_name,
      coins: null, // plus disponible via playtimes endpoint, retiré
    };
  }

  return NextResponse.json({ ok: true, data });
}
