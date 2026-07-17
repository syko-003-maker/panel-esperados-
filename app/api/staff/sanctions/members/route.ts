import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";
import { BLOCKING_SANCTION_TYPES } from "@/lib/sanctions";
import { isSanctionableScopeMember } from "@/lib/staff/member-scope";
import { GRADE_LABEL_BY_ROLE_ID, resolveMemberGradeRoleId } from "@/lib/grade-colors";

export async function GET(req: Request) {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const familyId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  const q = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? "500"), 500);

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
      discordInGuild: true,
      missingFromLygSince: true,
      lastSeenAt: true,
    },
  });

  // "En famille" = vu au dernier sync LYG. Beaucoup de membres restent
  // isActive=true alors qu'ils ont quitté la famille depuis des mois (la sync
  // ne les désactive pas → 129 "actifs" dont ~93 plus vus depuis des semaines).
  // On mesure la fraîcheur par rapport au sync LE PLUS RÉCENT (relatif, pas à
  // "now") : robuste si le poller LYG tombe en panne (sinon on masquerait toute
  // la famille au lieu d'un seuil absolu).
  const lastSyncMs = members.reduce((max, m) => {
    const t = m.lastSeenAt ? m.lastSeenAt.getTime() : 0;
    return t > max ? t : max;
  }, 0);
  const IN_FAMILY_GRACE_MS = 2 * 24 * 60 * 60 * 1000; // 2 jours de tolérance
  const inFamilyCutoff = lastSyncMs - IN_FAMILY_GRACE_MS;
  const seenInLatestSync = (m: { lastSeenAt: Date | null }) =>
    lastSyncMs === 0 || (m.lastSeenAt != null && m.lastSeenAt.getTime() >= inFamilyCutoff);

  // On inclut réservistes et démotés (escalade possible) MAIS seulement s'ils
  // sont encore dans la famille (vus au dernier sync) et dans le Discord.
  // Seuls les blacklistés restent exclus (plus rien à escalader au-dessus).
  const candidateMembers = members.filter((m) => isSanctionableScopeMember(m) && seenInLatestSync(m));

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
    items: candidateMembers.map((member) => {
      // Grade courant (pour l'outil de rétrogradation) : rôle de grade LIVE le
      // plus haut, sinon rankRoleId. Label lisible pour l'UI.
      const liveRoleIds = Array.isArray(member.discordRoleIds) ? (member.discordRoleIds as string[]) : [];
      const currentRoleId =
        resolveMemberGradeRoleId(liveRoleIds) ??
        (member.rankRoleId && GRADE_LABEL_BY_ROLE_ID[member.rankRoleId] ? member.rankRoleId : null);
      const currentGrade = currentRoleId
        ? GRADE_LABEL_BY_ROLE_ID[currentRoleId]
        : member.rankLabel ?? member.grade ?? null;
      return {
        id: member.id,
        rpName: member.rpName ?? "Unknown",
        discordId: member.discordId ?? null,
        activeSanctionType: activeByMember.get(member.id) ?? null,
        currentRoleId,
        currentGrade,
      };
    }),
  });
}
