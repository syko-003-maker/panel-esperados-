/**
 * Façade historique — l'implémentation vit désormais dans `avatars.ts`.
 *
 * Ces deux noms sont utilisés dans une vingtaine de fichiers : les conserver
 * évite une réécriture massive, mais il n'y a plus qu'un seul moteur derrière.
 */
export {
  extractHashFromUrl as extractDiscordAvatarHash,
  avatarUrl as getDiscordAvatarUrl,
} from "./avatars";
