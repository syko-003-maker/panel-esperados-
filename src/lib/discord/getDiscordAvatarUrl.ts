export function extractDiscordAvatarHash(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;

  const match = imageUrl.match(/cdn\.discordapp\.com\/avatars\/\d+\/([a-zA-Z0-9_]+)\./);
  return match?.[1] ?? null;
}

export function getDiscordAvatarUrl(discordId: string | null | undefined, avatarHash: string | null | undefined): string | null {
  if (!discordId) return null;

  // Route via le proxy /api/avatar : il résout le hash EN DIRECT (cache 1 h)
  // et retombe sur l'avatar par défaut, donc l'image n'est jamais cassée même
  // si `avatarHash` (stocké) est périmé. On passe le hash connu en indice (?h)
  // pour un affichage instantané pendant que le proxy rafraîchit.
  const q = avatarHash ? `?h=${encodeURIComponent(avatarHash)}` : "";
  return `/api/avatar/${discordId}${q}`;
}
