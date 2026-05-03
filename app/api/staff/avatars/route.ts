import { NextRequest, NextResponse } from "next/server";
import { requireStaffAccess } from "@/lib/rbac";
import { getAvatarHashes } from "@/lib/discord/avatar-cache";
import { getDiscordAvatarUrl } from "@/lib/discord/getDiscordAvatarUrl";

/**
 * GET /api/staff/avatars?ids=discordId1,discordId2,...
 *
 * Retourne une map { [discordId]: avatarUrl | null } pour la liste d'IDs demandée.
 * Utilise le cache partagé (mémoire + DB Account + Discord API avec gestion rate-limit).
 */
export async function GET(req: NextRequest) {
  const guard = await requireStaffAccess();
  if (guard instanceof Response) return guard;

  const raw = req.nextUrl.searchParams.get("ids") ?? "";
  const discordIds = raw
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .slice(0, 200); // cap de sécurité

  if (!discordIds.length) {
    return NextResponse.json({});
  }

  const hashes = await getAvatarHashes(discordIds);

  const result: Record<string, string | null> = {};
  for (const id of discordIds) {
    const hash = hashes.get(id) ?? null;
    result[id] = getDiscordAvatarUrl(id, hash);
  }

  return NextResponse.json(result, {
    headers: {
      // Cache côté CDN/proxy : 5 min. Revalidation en arrière-plan.
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60",
    },
  });
}
