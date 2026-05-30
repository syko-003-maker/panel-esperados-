import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";
import { BLOCKING_SANCTION_TYPES } from "@/lib/sanctions";
import { isSanctionableScopeMember } from "@/lib/staff/member-scope";

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

  // On inclut maintenant les réservistes et démotés dans la liste : ils
  // peuvent être escaladés vers DEMOTE/BLACKLIST. Seuls les blacklistés
  // restent exclus (plus rien à escalader au-dessus).
  const candidateMembers = members.filter(isSanctionableScopeMember);

  // Lookup des sanctions BLOQUANTES actives pour affichage côté UI.
  // On ne les exclut plus du picker — la logique d'escalade est gérée
  // côté POST. Mais le client peut afficher un badge "déjà réserviste"
  // ou "déjà démoté" pour informer le staff.
  const activeSanctions = candidateMembers.length
    ? await prisma.sanction.findMany({
        where: {
          familyId,
          memberId: { in: candidateMembers.map((member) => member.id) },
          status: "ACTIVE",
          clearedAt: null,
          type: { in: [...BLOCKING_SANCTION_TYPES] },
        },
        select: { memberId: true, type: true },
      })
    : [];

  const activeByMember = new Map<string, string>();
  for (const s of activeSanctions) {
    if (s.memberId) activeByMember.set(s.memberId, s.type);
  }

  return NextResponse.json({
    ok: true,
    items: candidateMembers.map((member) => ({
      id: member.id,
      rpName: member.rpName ?? "Unknown",
      discordId: member.discordId ?? null,
      activeSanctionType: activeByMember.get(member.id) ?? null,
    })),
  });
}
