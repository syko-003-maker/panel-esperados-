import { NextResponse } from "next/server";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { prisma } from "@/lib/db";

/**
 * GET /api/debug/members-duplicates
 * 
 * Analyse les doublons et membres invalides dans la table Member
 * 
 * Retourne:
 * - total: nombre total de membres
 * - nullSteamId: membres sans steamId
 * - duplicateSteamIds: steamIds en double
 * - duplicateDiscordIds: discordIds en double
 * - ghostMembers: membres créés depuis BANKLOG_GHOST
 * - recommendations: actions à prendre pour nettoyer
 */
export async function GET() {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  try {
    const familyId = "esperados";
    
    // Get family ID
    const family = await prisma.family.findUnique({
      where: { slug: familyId },
      select: { id: true },
    });

    if (!family) {
      return NextResponse.json({
        ok: false,
        error: "FAMILY_NOT_FOUND",
      }, { status: 404 });
    }

    // 1. Total count
    const totalMembers = await prisma.member.count({
      where: {
        familyId: family.id,
        isActive: true,
      },
    });

    // 2. Members with null steamId
    const nullSteamIdMembers = await prisma.member.findMany({
      where: {
        familyId: family.id,
        isActive: true,
        steamId: null,
      },
      select: {
        id: true,
        discordId: true,
        rpName: true,
        source: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // 3. Duplicate steamIds
    const steamIdGroups = await prisma.member.groupBy({
      by: ["steamId"],
      where: {
        familyId: family.id,
        isActive: true,
        steamId: { not: null },
      },
      _count: {
        steamId: true,
      },
      having: {
        steamId: {
          _count: {
            gt: 1,
          },
        },
      },
    });

    const duplicateSteamIds: Array<{ steamId: string; count: number; members: any[] }> = [];
    for (const group of steamIdGroups) {
      const members = await prisma.member.findMany({
        where: {
          familyId: family.id,
          isActive: true,
          steamId: group.steamId,
        },
        select: {
          id: true,
          steamId: true,
          discordId: true,
          rpName: true,
          source: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: "desc" },
      });

      duplicateSteamIds.push({
        steamId: group.steamId!,
        count: group._count.steamId,
        members,
      });
    }

    // 4. Duplicate discordIds
    const discordIdGroups = await prisma.member.groupBy({
      by: ["discordId"],
      where: {
        familyId: family.id,
        isActive: true,
        discordId: { not: null },
      },
      _count: {
        discordId: true,
      },
      having: {
        discordId: {
          _count: {
            gt: 1,
          },
        },
      },
    });

    const duplicateDiscordIds: Array<{ discordId: string; count: number; members: any[] }> = [];
    for (const group of discordIdGroups) {
      const members = await prisma.member.findMany({
        where: {
          familyId: family.id,
          isActive: true,
          discordId: group.discordId,
        },
        select: {
          id: true,
          steamId: true,
          discordId: true,
          rpName: true,
          source: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: "desc" },
      });

      duplicateDiscordIds.push({
        discordId: group.discordId!,
        count: group._count.discordId,
        members,
      });
    }

    // 5. Ghost members (from BANKLOG)
    const ghostMembers = await prisma.member.findMany({
      where: {
        familyId: family.id,
        isActive: true,
        source: "BANKLOG_GHOST",
      },
      select: {
        id: true,
        steamId: true,
        discordId: true,
        rpName: true,
        source: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    // 6. Count by source
    const sourceBreakdown = await prisma.member.groupBy({
      by: ["source"],
      where: {
        familyId: family.id,
        isActive: true,
      },
      _count: {
        source: true,
      },
      orderBy: {
        _count: {
          source: "desc",
        },
      },
    });

    // 7. Total excluding ghosts
    const realMembersCount = await prisma.member.count({
      where: {
        familyId: family.id,
        isActive: true,
        source: { not: "BANKLOG_GHOST" },
      },
    });

    // 8. Recommendations
    const recommendations: string[] = [];
    
    if (nullSteamIdMembers.length > 0) {
      recommendations.push(
        `${nullSteamIdMembers.length} members have null steamId - consider marking them as PENDING or moving to a separate table`
      );
    }

    if (duplicateSteamIds.length > 0) {
      recommendations.push(
        `${duplicateSteamIds.length} duplicate steamIds found - merge or mark older records as inactive`
      );
    }

    if (duplicateDiscordIds.length > 0) {
      recommendations.push(
        `${duplicateDiscordIds.length} duplicate discordIds found - merge or mark older records as inactive`
      );
    }

    if (ghostMembers.length > 0) {
      recommendations.push(
        `${ghostMembers.length} ghost members (BANKLOG_GHOST) found - these are excluded from counts but should be cleaned up`
      );
      recommendations.push(
        "Run cleanup script: DELETE FROM Member WHERE familyId = '...' AND source = 'BANKLOG_GHOST' AND isActive = true"
      );
    }

    if (totalMembers !== realMembersCount) {
      recommendations.push(
        `Display count should be ${realMembersCount} (excluding ghosts) instead of ${totalMembers}`
      );
    }

    return NextResponse.json({
      ok: true,
      familyId,
      summary: {
        totalMembers,
        realMembersCount,
        ghostMembersCount: ghostMembers.length,
        nullSteamIdCount: nullSteamIdMembers.length,
        duplicateSteamIdsCount: duplicateSteamIds.length,
        duplicateDiscordIdsCount: duplicateDiscordIds.length,
      },
      sourceBreakdown,
      details: {
        nullSteamIdMembers,
        duplicateSteamIds,
        duplicateDiscordIds,
        ghostMembers: ghostMembers.slice(0, 20), // Limit to 20 for readability
      },
      recommendations,
    });
  } catch (error: any) {
    console.error("[/api/debug/members-duplicates] Error:", error);
    return NextResponse.json({
      ok: false,
      error: "Failed to analyze duplicates",
      details: error.message || String(error),
    }, { status: 500 });
  }
}
