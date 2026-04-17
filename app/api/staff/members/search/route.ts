import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePrivileged } from "@/lib/guards";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";
import { isActiveMembersScopeMember } from "@/lib/staff/member-scope";

/**
 * GET /api/staff/members/search?q=NomRP&limit=20
 * Recherche légère de membres actifs par nom RP ou Discord ID.
 * Utilisée par les formulaires staff (absences, sanctions, etc.).
 */
export async function GET(req: Request) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const limitRaw = Number(searchParams.get("limit") ?? "20");
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 20, 1), 50);

  const familyId = await resolveFamilyId(DEFAULT_FAMILY_ID);

  const members = await prisma.member.findMany({
    where: {
      familyId,
      isGhost: false,
      ...(q
        ? {
            OR: [
              { rpName: { contains: q, mode: "insensitive" } },
              { discordId: { contains: q } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      rpName: true,
      discordId: true,
      isActive: true,
      discordRoleIds: true,
      grade: true,
      rankLabel: true,
    },
    orderBy: { rpName: "asc" },
    take: limit * 3, // surdimensionné pour filtrer après
  });

  // Filtrer uniquement les membres actifs (même logique que la page membres)
  const active = members.filter(isActiveMembersScopeMember).slice(0, limit);

  return NextResponse.json({
    ok: true,
    data: active.map((m) => ({
      id: m.id,
      rpName: m.rpName,
      discordId: m.discordId,
      grade: m.rankLabel ?? m.grade ?? null,
    })),
  });
}
