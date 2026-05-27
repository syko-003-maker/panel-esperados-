import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireFullWriter } from "@/lib/guards";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";

/**
 * GET /api/staff/family/members
 *
 * Liste TOUS les membres pertinents pour la gestion WL famille :
 *   - Membres présents dans la famille LYG (wlClass != null)
 *   - Membres planifiés par le panel (wlClassIntent != null)
 *   - Diff : intent vs réel = quoi appliquer sur families.lyg.fr
 *
 * Réservé Chef famille + Sous-Chef famille + EM (= requireFullWriter).
 * Encadrant et Recruteur sont exclus, la WL famille étant une donnée
 * sensible (présence sur le serveur de jeu, hiérarchie).
 */
export async function GET() {
  const guard = await requireFullWriter();
  if (guard instanceof Response) return guard;

  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);

  const members = await prisma.member.findMany({
    where: {
      familyId: familyDbId,
      OR: [
        { wlClass: { not: null } },
        { wlClassIntent: { not: null } },
      ],
    },
    select: {
      id: true,
      steamId: true,
      discordId: true,
      rpName: true,
      grade: true,
      rankLabel: true,
      discordAvatarHash: true,
      wlClass: true,
      wlOwner: true,
      wlClassIntent: true,
      wlOwnerIntent: true,
      wlIntentUpdatedAt: true,
      wlIntentBy: true,
    },
    orderBy: [
      // 1=Chef en haut, 5 en bas. null à la fin.
      { wlOwner: "desc" },
      { wlClass: "asc" },
      { rpName: "asc" },
    ],
  });

  const rows = members.map((m) => {
    const classDiff = (m.wlClassIntent ?? null) !== (m.wlClass ?? null);
    const ownerDiff = m.wlOwnerIntent !== m.wlOwner;
    return {
      id: m.id,
      steamId: m.steamId,
      discordId: m.discordId,
      rpName: m.rpName,
      grade: m.grade,
      rankLabel: m.rankLabel,
      discordAvatarHash: m.discordAvatarHash,
      // état LYG live
      wlClass: m.wlClass,
      wlOwner: m.wlOwner,
      // état planifié
      wlClassIntent: m.wlClassIntent,
      wlOwnerIntent: m.wlOwnerIntent,
      wlIntentUpdatedAt: m.wlIntentUpdatedAt?.toISOString() ?? null,
      wlIntentBy: m.wlIntentBy,
      // flags diff (utiles côté UI pour highlight)
      hasClassDiff: classDiff,
      hasOwnerDiff: ownerDiff,
      hasAnyDiff: classDiff || ownerDiff,
    };
  });

  const pendingCount = rows.filter((r) => r.hasAnyDiff).length;

  return NextResponse.json({
    ok: true,
    rows,
    counts: {
      total: rows.length,
      pending: pendingCount,
    },
  });
}
