import { NextRequest, NextResponse } from "next/server";
import { resolveDiscordId } from "../../../push/_scope";
import { recentNotifications } from "@/lib/notify-bus";

/**
 * Sondage des notifications récentes pour l'appli desktop (Electron), qui ne
 * peut pas recevoir de web push. Renvoie `now` (horloge serveur) que le client
 * repasse en `since` au tour suivant (pas de dérive d'horloge). Sans `since`
 * = synchro initiale (aucun item, on évite de rejouer l'historique au lancement).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const discordId = await resolveDiscordId();
  if (!discordId) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const sinceParam = req.nextUrl.searchParams.get("since");
  const since = sinceParam != null ? Number(sinceParam) : null;
  const items = since != null && Number.isFinite(since) ? recentNotifications(discordId, since) : [];

  return NextResponse.json(
    { ok: true, now: Date.now(), items },
    { headers: { "Cache-Control": "no-store" } }
  );
}
