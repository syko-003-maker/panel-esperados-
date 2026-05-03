import { NextResponse } from "next/server";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { prisma } from "@/lib/db";

export async function GET() {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const DEMOTE_ROLE_ID     = "1340837563753304075";
  const BLACKLIST_ROLE_ID  = "1338901141873758288";
  const RESERVIST_ROLE_ID  = "1312845999366209682";

  // Membres actifs avec warns, avec un grade valide, en excluant démotés, blacklistés et réservistes
  const members = await prisma.member.findMany({
    where: {
      isActive: true,
      gradeLevel: { gt: 0 },
      lygWarns: { some: {} },
      NOT: [
        { discordRoleIds: { has: DEMOTE_ROLE_ID    } },
        { discordRoleIds: { has: BLACKLIST_ROLE_ID } },
        { discordRoleIds: { has: RESERVIST_ROLE_ID } },
      ],
    },
    select: {
      id: true,
      discordId: true,
      rpName: true,
      grade: true,
      steamId: true,
      lygWarns: {
        orderBy: { warnDate: "desc" },
        take: 10,
        select: {
          id: true,
          reason: true,
          type: true,
          warnDate: true,
          expired: true,
          notified: true,
          seenAt: true,
        },
      },
    },
  });

  const data = members
    .map((m) => {
      const warns = m.lygWarns;
      const activeWarns = warns.filter((w) => !w.expired).length;
      const last = warns[0] ?? null;
      return {
        memberId: m.id,
        discordId: m.discordId,
        rpName: m.rpName,
        grade: m.grade,
        steamId: m.steamId,
        totalWarns: warns.length,
        activeWarns,
        lastWarnDate: last?.warnDate?.toISOString() ?? null,
        lastWarnReason: last?.reason ?? null,
        lastWarnType: last?.type ?? null,
        recentWarns: warns.map((w) => ({
          reason: w.reason,
          type: w.type,
          date: w.warnDate.toISOString(),
          expired: w.expired,
        })),
      };
    })
    .sort((a, b) => {
      if (!a.lastWarnDate) return 1;
      if (!b.lastWarnDate) return -1;
      return new Date(b.lastWarnDate).getTime() - new Date(a.lastWarnDate).getTime();
    });

  return NextResponse.json({ ok: true, data });
}
