import { prisma } from "@/lib/db";
import { extractDiscordAvatarHash } from "@/lib/discord/getDiscordAvatarUrl";

export async function resolveAvatarHashByDiscordId(discordIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const ids = Array.from(
    new Set(
      (Array.isArray(discordIds) ? discordIds : [])
        .map((id) => String(id ?? "").trim())
        .filter(Boolean)
    )
  );

  if (ids.length === 0) return out;

  for (const id of ids) out.set(id, null);

  const accounts = await prisma.account.findMany({
    where: {
      provider: "discord",
      providerAccountId: { in: ids },
    },
    select: {
      providerAccountId: true,
      user: {
        select: {
          image: true,
        },
      },
    },
  });

  for (const account of accounts) {
    const discordId = String(account.providerAccountId ?? "").trim();
    if (!discordId) continue;
    const hash = extractDiscordAvatarHash(account.user?.image ?? null);
    out.set(discordId, hash);
  }

  return out;
}
