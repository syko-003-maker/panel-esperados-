import { NextRequest, NextResponse } from "next/server";
import { requireStaffAccess } from "@/lib/rbac";
import { getAvatarHashesFast, warmAvatarCache } from "@/lib/discord/avatar-cache";
import { getDiscordAvatarUrl } from "@/lib/discord/getDiscordAvatarUrl";

/**
 * GET /api/staff/avatars?ids=discordId1,discordId2,...
 *
 * Répond IMMÉDIATEMENT avec ce qui est en cache (mémoire + Account table).
 * En parallèle, déclenche le fetch Discord API en arrière-plan pour les IDs manquants.
 * Le client doit refaire un appel après quelques secondes pour récupérer le reste.
 *
 * Retourne : { [discordId]: avatarUrl | null }
 */
export async function GET(req: NextRequest) {
  const guard = await requireStaffAccess();
  if (guard instanceof Response) return guard;

  const raw = req.nextUrl.searchParams.get("ids") ?? "";
  const discordIds = raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 200);

  if (!discordIds.length) {
    return NextResponse.json({});
  }

  // Réponse rapide : cache mémoire + Account table seulement (<100 ms)
  const hashes = await getAvatarHashesFast(discordIds);

  // Déclencher le fetch Discord API en arrière-plan pour les IDs manquants
  const missing = discordIds.filter((id) => !hashes.has(id));
  if (missing.length > 0) {
    warmAvatarCache(missing);
  }

  // Construire la réponse avec ce qu'on a maintenant
  const result: Record<string, string | null> = {};
  for (const id of discordIds) {
    const hash = hashes.get(id) ?? null;
    result[id] = getDiscordAvatarUrl(id, hash);
  }

  return NextResponse.json(result, {
    headers: {
      // Pas de cache navigateur : le client refait des appels pour récupérer le reste
      "Cache-Control": "no-store",
    },
  });
}
