/**
 * Façade historique — l'implémentation vit désormais dans `avatars.ts`.
 *
 * Cette version ne lisait QUE `Account.user.image`, figé au dernier login
 * OAuth : elle renvoyait donc un hash mort pour tout membre ne s'étant pas
 * reconnecté depuis son changement de photo. Le moteur unique consulte
 * `Member.discordAvatarHash` en priorité et ne retombe sur `Account` qu'ensuite.
 */

import { getKnownHashes } from "./avatars";

export async function resolveAvatarHashByDiscordId(
  discordIds: string[],
): Promise<Map<string, string | null>> {
  return getKnownHashes(Array.isArray(discordIds) ? discordIds : []);
}
