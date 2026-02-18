export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";

export async function GET(req: Request) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const familySlug = searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;
  const familyId = await resolveFamilyId(familySlug);

  // Prisma groupBy pour compter par type
  const groups = await prisma.bankLog.groupBy({
    by: ["type"],
    where: { familyId },
    _count: { _all: true },
    _sum: { money: true },
    orderBy: { type: "asc" },
  });

  return NextResponse.json({
    ok: true,
    familyId,
    familySlug,
    types: groups.map((g) => ({
      type: g.type,
      count: g._count._all,
      sumMoney: g._sum.money ?? 0,
    })),
  });
}
