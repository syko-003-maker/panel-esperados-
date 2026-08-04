import { NextRequest, NextResponse } from "next/server";
import { resolveForProxy, cdnUrl, defaultAvatarUrl } from "@/lib/discord/avatars";

/**
 * Proxy d'avatar Discord — l'unique URL servie dans les `<img src>` du panel.
 *
 * Toute la logique (cache, quota, file d'attente, persistance) vit dans
 * `src/lib/discord/avatars.ts`. Cette route n'est plus qu'un aiguillage : elle
 * portait auparavant son propre cache et appelait Discord pour CHAQUE avatar,
 * ce qui, cumulé aux autres systèmes, provoquait des 429 et faisait disparaître
 * les photos.
 *
 * Public : les avatars Discord le sont. Utilisé via `<img src>`, donc valable
 * en composant serveur comme client.
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ discordId: string }> },
) {
  const { discordId } = await params;
  const sp = req.nextUrl.searchParams;
  const hint = sp.get("h");
  const size = (sp.get("size") || "64").replace(/\D/g, "") || "64";

  const redirect = (url: string) =>
    NextResponse.redirect(url, {
      status: 302,
      headers: { "Cache-Control": "public, max-age=600" },
    });

  if (!/^\d{5,25}$/.test(discordId)) return redirect(defaultAvatarUrl(discordId || "0"));

  const hash = await resolveForProxy(discordId, hint).catch(() => hint);
  if (hash) return redirect(cdnUrl(discordId, hash, size));
  return redirect(defaultAvatarUrl(discordId));
}
