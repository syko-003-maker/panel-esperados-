import { prisma } from "@/lib/db";

/**
 * Nom reconnaissable d'un membre du staff, à partir de son compte panel.
 *
 * Le compte panel porte le pseudo Discord brut : « crakers76 », « tyguel__ ».
 * Personne ne sait que ce sont Denis Brouillard et Tyson Blacke — afficher ça
 * sur une sanction ne dit donc rien à celui qui la lit.
 *
 * On remonte la chaîne User → Account(discord) → Member pour retrouver le nom
 * RP, celui que tout le monde utilise. Chaque maillon peut manquer (compte non
 * lié, staff sans fiche membre) : on retombe alors sur le pseudo, plutôt que
 * sur rien.
 */

/** Résout plusieurs comptes d'un coup — trois requêtes au total, pas 3×N. */
export async function resolveStaffNames(
  userIds: readonly string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return out;

  const [users, accounts] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true },
    }),
    prisma.account.findMany({
      where: { userId: { in: ids }, provider: "discord" },
      select: { userId: true, providerAccountId: true },
    }),
  ]);

  const discordByUser = new Map(accounts.map((a) => [a.userId, a.providerAccountId]));
  const discordIds = [...discordByUser.values()];

  const members = discordIds.length
    ? await prisma.member.findMany({
        where: { discordId: { in: discordIds } },
        select: { discordId: true, rpName: true, discordDisplayName: true },
      })
    : [];
  const memberByDiscord = new Map(members.map((m) => [m.discordId as string, m]));

  for (const u of users) {
    const discordId = discordByUser.get(u.id);
    const member = discordId ? memberByDiscord.get(discordId) : null;
    // Le nom RP d'abord : c'est celui sous lequel la personne est connue.
    const label =
      member?.rpName?.trim() ||
      member?.discordDisplayName?.trim() ||
      u.name?.trim() ||
      null;
    if (label) out.set(u.id, label);
  }

  return out;
}

/** Variante pour un seul compte. */
export async function resolveStaffName(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const map = await resolveStaffNames([userId]);
  return map.get(userId) ?? null;
}
