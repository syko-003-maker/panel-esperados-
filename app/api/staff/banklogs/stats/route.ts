export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

export async function GET(req: Request) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const familySlug = searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;
  const familyId = await resolveFamilyId(familySlug);

  const from = startOfDay(new Date());      // aujourd'hui
  const from7 = startOfDay(daysAgo(7));     // 7 derniers jours
  const from30 = startOfDay(daysAgo(30));   // 30 derniers jours

  // type 1 = retrait, type 2 = depot
  async function sumSince(since: Date) {
    const [dep, wit] = await Promise.all([
      prisma.bankLog.aggregate({
        where: { familyId, type: 2, at: { gte: since } },
        _sum: { money: true },
        _count: { _all: true },
      }),
      prisma.bankLog.aggregate({
        where: { familyId, type: 1, at: { gte: since } },
        _sum: { money: true },
        _count: { _all: true },
      }),
    ]);

    const deposits = dep._sum.money ?? 0;
    const withdrawals = wit._sum.money ?? 0;

    return {
      deposits,
      withdrawals,
      net: deposits - withdrawals,
      countDeposits: dep._count._all,
      countWithdrawals: wit._count._all,
    };
  }

  const [today, last7d, last30d] = await Promise.all([
    sumSince(from),
    sumSince(from7),
    sumSince(from30),
  ]);

  return NextResponse.json({
    ok: true,
    familyId,
    familySlug,
    today,
    last7d,
    last30d,
  });
}
