import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentMemberOrThrowish } from "@/lib/me";

export async function GET(_req: Request) {
  const current = await getCurrentMemberOrThrowish();
  if (!current.ok) {
    return NextResponse.json({ ok: false, error: current.error }, { status: current.status });
  }

  const { familyId, discordId, member } = current;

  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [depAgg, witAgg] = await Promise.all([
    prisma.bankLog.aggregate({
      where: { familyId, steamId: member.steamId ?? "", type: 2, at: { gte: from } },
      _sum: { money: true },
      _count: { _all: true },
    }),
    prisma.bankLog.aggregate({
      where: { familyId, steamId: member.steamId ?? "", type: 1, at: { gte: from } },
      _sum: { money: true },
      _count: { _all: true },
    }),
  ]);

  const totalDeposits = depAgg._sum.money ?? 0;
  const totalWithdrawals = witAgg._sum.money ?? 0;
  const txCount = (depAgg._count._all ?? 0) + (witAgg._count._all ?? 0);

  const sanctionGroups = await prisma.sanction.groupBy({
    by: ["status"],
    where: { familyId, discordId: String(discordId) },
    _count: { _all: true },
  });
  const absencesGroups = await prisma.absence.groupBy({
    by: ["status"],
    where: { familyId, discordId: String(discordId) },
    _count: { _all: true },
  });

  const sanctions = Object.fromEntries(
    sanctionGroups.map((g) => [g.status, g._count._all])
  );
  const absences = Object.fromEntries(
    absencesGroups.map((g) => [g.status, g._count._all])
  );

  return NextResponse.json({
    ok: true,
    member: {
      steamId: member.steamId,
      rpName: member.rpName,
      age: member.age,
    },
    bank: {
      totalDeposits,
      totalWithdrawals,
      net: totalDeposits - totalWithdrawals,
      txCount,
    },
    sanctions: {
      counts: sanctions,
    },
    absences: {
      counts: absences,
    },
  });
}
