import { NextResponse } from "next/server";
import { resolveDiscordId } from "../../../push/_scope";
import { publishNotification } from "@/lib/notify-bus";

/**
 * Test de la chaîne autonome de l'appli desktop : publie une notif dans le bus
 * mémoire (PAS de web push). L'appli, qui sonde /api/me/notifications/recent,
 * l'affichera en natif — prouvant que ça ne dépend ni d'Apple ni de Google.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const discordId = await resolveDiscordId();
  if (!discordId) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  publishNotification([discordId], {
    title: "🔔 Test — appli connectée",
    body: "Cette notification vient directement du serveur, sans passer par Apple ni Google.",
    url: "/dashboard",
    tag: "desktop-test",
  });

  return NextResponse.json({ ok: true });
}
