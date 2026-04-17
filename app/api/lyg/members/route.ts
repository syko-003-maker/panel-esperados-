import { NextRequest, NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const familySlug = req.nextUrl.searchParams.get("familyId") || DEFAULT_FAMILY_ID;
  const familyDbId = await resolveFamilyId(familySlug);

  const members = await prisma.member.findMany({
    where: { familyId: familyDbId },
    select: {
      id: true,
      steamId: true,
      discordId: true,
      rpName: true,
      grade: true,
      rankLabel: true,
      isActive: true,
      source: true,
      lastSeenAt: true,
      updatedAt: true,
    },
    orderBy: [{ isActive: "desc" }, { rpName: "asc" }],
    take: 5000,
  });

  return NextResponse.json({
    ok: true,
    source: "db",
    data: members,
    fetchedAt: new Date().toISOString(),
  });
}
