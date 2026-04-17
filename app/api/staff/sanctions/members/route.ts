import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";
import { BLOCKING_SANCTION_TYPES } from "@/lib/sanctions";
import { isActiveMembersScopeMember } from "@/lib/staff/member-scope";

export async function GET(req: Request) {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const familyId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? "200"), 500);

  const where: any = { familyId };
  if (q) {
    where.OR = [
      { rpName: { contains: q, mode: "insensitive" } },
      { discordId: { contains: q } },
      { steamId: { contains: q } },
    ];
  }

  const members = await prisma.member.findMany({
    where,
    orderBy: { rpName: "asc" },
    take: limit,
    select: {
      id: true,
      rpName: true,
      discordId: true,
      isActive: true,
      isGhost: true,
      source: true,
      grade: true,
      rankRoleId: true,
      rankLabel: true,
      discordRoleIds: true,
    },
  });

  const candidateMembers = members.filter(isActiveMembersScopeMember);

  const blockedSanctions = candidateMembers.length
    ? await prisma.sanction.findMany({
        where: {
          familyId,
          memberId: { in: candidateMembers.map((member) => member.id) },
          status: "ACTIVE",
          clearedAt: null,
          type: { in: [...BLOCKING_SANCTION_TYPES] },
        },
        select: { memberId: true },
      })
    : [];

  const blockedMemberIds = new Set(
    blockedSanctions
      .map((sanction) => sanction.memberId)
      .filter((memberId): memberId is string => Boolean(memberId))
  );

  const sanctionableMembers = candidateMembers.filter((member) => !blockedMemberIds.has(member.id));

  return NextResponse.json({
    ok: true,
    items: sanctionableMembers.map((member) => ({
      id: member.id,
      rpName: member.rpName ?? "Unknown",
      discordId: member.discordId ?? null,
    })),
  });
}
