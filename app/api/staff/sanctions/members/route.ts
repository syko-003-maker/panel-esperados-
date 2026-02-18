import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChefOrEtatMajor } from "@/lib/guards";

export async function GET(req: Request) {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const familyId = searchParams.get("familyId") ?? "esperados";
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
    select: { id: true, rpName: true, discordId: true },
  });

  return NextResponse.json({
    ok: true,
    items: members.map((member) => ({
      id: member.id,
      rpName: member.rpName ?? "Unknown",
      discordId: member.discordId ?? null,
    })),
  });
}
