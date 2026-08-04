/**
 * Façade historique — l'implémentation vit désormais dans `avatars.ts`.
 *
 * Ce module portait son propre cache, sa propre persistance et son propre
 * « warm » à 5 requêtes en parallèle toutes les 100 ms. C'est cette rafale,
 * cumulée aux appels du proxy /api/avatar, qui déclenchait les 429 de Discord
 * et faisait disparaître les photos de profil. Le moteur unique sérialise et
 * espace tous les appels.
 *
 * Les noms sont conservés pour ne pas réécrire les appelants.
 */

import { getKnownHashes, getHashesLive, warm, avatarUrl } from "./avatars";

/**
 * Hashs connus, sans jamais attendre Discord (< 100 ms).
 * Les identifiants inconnus partent se résoudre en arrière-plan.
 */
export async function getAvatarHashesFast(
  discordIds: string[],
): Promise<Map<string, string | null>> {
  return getKnownHashes(discordIds);
}

/** Rafraîchissement en arrière-plan. Sérialisé et espacé, sans rafale. */
export function warmAvatarCache(discordIds: string[]): void {
  warm(discordIds);
}

/** Version qui attend Discord pour ce qui reste inconnu. */
export async function getAvatarHashes(
  discordIds: string[],
): Promise<Map<string, string | null>> {
  return getHashesLive(discordIds);
}

/** URL d'avatar indexée par SteamID, depuis une table SteamID → DiscordID. */
export async function buildAvatarUrlBySteam(
  discordIdBySteam: Map<string, string>,
): Promise<Map<string, string | null>> {
  const hashes = await getHashesLive([...new Set(discordIdBySteam.values())]);

  const result = new Map<string, string | null>();
  for (const [steamId, discordId] of discordIdBySteam) {
    result.set(steamId, avatarUrl(discordId, hashes.get(discordId) ?? null));
  }
  return result;
}
