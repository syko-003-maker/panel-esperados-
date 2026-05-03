export function extractDiscordAvatarHash(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;

  const match = imageUrl.match(/cdn\.discordapp\.com\/avatars\/\d+\/([a-zA-Z0-9_]+)\./);
  return match?.[1] ?? null;
}

export function getDiscordAvatarUrl(discordId: string | null | undefined, avatarHash: string | null | undefined): string | null {
  if (!discordId) return null;

  // Avatar custom
  if (avatarHash) {
    const ext = avatarHash.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.${ext}?size=64`;
  }

  // Avatar Discord par défaut (basé sur l'ID utilisateur, sans BigInt)
  try {
    // Les 4 derniers chiffres de l'ID suffisent pour la distribution mod 6
    const index = parseInt(discordId.slice(-4), 10) % 6;
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  } catch {
    return `https://cdn.discordapp.com/embed/avatars/0.png`;
  }
}
