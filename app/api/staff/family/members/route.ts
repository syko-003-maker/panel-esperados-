import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireFullWriter } from "@/lib/guards";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";
import { getDiscordGrade } from "@/lib/discord-grade";
import { HIDDEN_MEMBER_DISCORD_IDS } from "@/lib/staff/member-scope";

/**
 * GET /api/staff/family/members
 *
 * Liste TOUS les membres pertinents pour la gestion WL famille :
 *   - Membres présents dans la famille LYG (wlClass != null)
 *   - Membres planifiés par le panel (wlClassIntent != null)
 *   - Diff : intent vs réel = quoi appliquer sur families.lyg.fr
 *
 * Réservé Chef famille + Sous-Chef famille + EM (= requireFullWriter). Encadrant exclu (zone sensible).
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
      AND: [
        {
          OR: [
            { wlClass: { not: null } },
            { wlClassIntent: { not: null } },
          ],
        },
        // Masqués : hors de la vue Famille WL. Leur état WL réel côté jeu
        // n'est pas modifié — on cesse seulement de l'afficher.
        //
        // Le `discordId: null` est INDISPENSABLE : en SQL, `col NOT IN (...)`
        // vaut NULL quand `col` est NULL, donc la ligne est écartée. Sans lui,
        // les membres sans Discord (Alber OG) disparaissaient eux aussi.
        {
          OR: [
            { discordId: null },
            { discordId: { notIn: [...HIDDEN_MEMBER_DISCORD_IDS] } },
          ],
        },
      ],
    },
    select: {
      id: true,
      steamId: true,
      discordId: true,
      rpName: true,
      grade: true,
      rankLabel: true,
      discordRoleIds: true,
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
    // Libellé de grade "honnête" : priorité aux états spéciaux Discord
    // (Blacklist/Demote), puis au grade du rôle Discord, puis au grade LYG.
    // Corrige les "—" affichés pour des membres qui ont bien un grade LYG mais
    // pas de rôle de grade Discord (ex. seulement Citoyen / aucun rôle).
    const dg = getDiscordGrade(m.discordRoleIds ?? []);
    const displayGrade = dg.isBlacklisted
      ? "Blacklist"
      : dg.isDemoted
        ? "Demote"
        : dg.grade || m.rankLabel || m.grade || null;
    return {
      id: m.id,
      steamId: m.steamId,
      discordId: m.discordId,
      rpName: m.rpName,
      grade: m.grade,
      rankLabel: m.rankLabel,
      displayGrade,
      isDemoted: dg.isDemoted,
      isBlacklisted: dg.isBlacklisted,
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
