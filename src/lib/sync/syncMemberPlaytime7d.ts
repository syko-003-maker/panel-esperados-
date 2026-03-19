import { prisma } from "@/lib/db";
import { resolveFamilyId } from "@/lib/family";
import { fetchFamilyPlaytimes7d } from "@/lib/lyg/fetchFamilyPlaytimes7d";

export async function syncMemberPlaytime7d(input: {
  familyId: string;
  token: string;
}): Promise<{
  fetched: number;
  updated: number;
}> {
  const familyDbId = await resolveFamilyId(input.familyId);

  const [rows, members] = await Promise.all([
    fetchFamilyPlaytimes7d(input.token),
    prisma.member.findMany({
      where: { familyId: familyDbId },
      select: { id: true, steamId: true, playtime7d: true },
    }),
  ]);

  const bySteam = new Map(rows.map((r) => [r.steamId, r.playtime7d]));
  const now = new Date();

  let updated = 0;

  for (const member of members) {
    if (!member.steamId) continue;

    if (!bySteam.has(member.steamId)) {
      const currentPlaytime = typeof member.playtime7d === "number" ? member.playtime7d : 0;

      if (currentPlaytime === 0) {
        await prisma.member.update({
          where: { id: member.id },
          data: {
            playtime7dUpdatedAt: now,
          },
        });
        continue;
      }

      await prisma.member.update({
        where: { id: member.id },
        data: {
          playtime7d: 0,
          playtime7dUpdatedAt: now,
        },
      });
      updated += 1;
      continue;
    }

    const nextPlaytime = bySteam.get(member.steamId) ?? 0;

    if (member.playtime7d === nextPlaytime) {
      await prisma.member.update({
        where: { id: member.id },
        data: {
          playtime7dUpdatedAt: now,
        },
      });
      continue;
    }

    await prisma.member.update({
      where: { id: member.id },
      data: {
        playtime7d: nextPlaytime,
        playtime7dUpdatedAt: now,
      },
    });
    updated += 1;
  }

  return {
    fetched: rows.length,
    updated,
  };
}
