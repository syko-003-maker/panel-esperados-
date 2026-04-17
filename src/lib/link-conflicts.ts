type LinkConflictLookup = {
  member: {
    findFirst: (args: any) => Promise<{
      id: string;
      familyId: string;
      discordId: string | null;
      steamId: string | null;
      rpName: string | null;
    } | null>;
  };
};

export async function findBlockingSteamLink(
  db: LinkConflictLookup,
  input: {
    familyId: string;
    steamId: string | null | undefined;
    excludeDiscordId?: string | null;
    excludeMemberId?: string | null;
  }
) {
  const familyId = String(input.familyId ?? "").trim();
  const steamId = String(input.steamId ?? "").trim();
  const excludeDiscordId = String(input.excludeDiscordId ?? "").trim();
  const excludeMemberId = String(input.excludeMemberId ?? "").trim();

  if (!familyId || !steamId) return null;

  const notFilters: Array<Record<string, string>> = [];
  if (excludeDiscordId) notFilters.push({ discordId: excludeDiscordId });
  if (excludeMemberId) notFilters.push({ id: excludeMemberId });

  return db.member.findFirst({
    where: {
      familyId,
      steamId,
      ...(notFilters.length > 0 ? { NOT: notFilters } : {}),
    },
    select: {
      id: true,
      familyId: true,
      discordId: true,
      steamId: true,
      rpName: true,
    },
  });
}
