export function extractDiscordAvatarHash(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;

  const match = imageUrl.match(/cdn\.discordapp\.com\/avatars\/\d+\/([a-zA-Z0-9_]+)\./);
  return match?.[1] ?? null;
}

export function getDiscordAvatarUrl(discordId: string | null | undefined, avatarHash: string | null | undefined): string | null {
  if (!discordId || !avatarHash) return null;

  const ext = avatarHash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.${ext}?size=64`;
}
