import { NextResponse } from "next/server";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { prisma } from "@/lib/db";

/**
 * POST /api/debug/members-cleanup
 * 
 * Execute cleanup operations on Member table:
 * 1. Delete BANKLOG_GHOST members
 * 2. Mark duplicate steamIds as inactive (keep most recent)
 * 3. Mark duplicate discordIds as inactive (keep most recent)
 * 
 * Requires: Chef or État-Major role
 * 
 * Query params:
 * - dryRun=true: Don't actually delete/update, just report what would be done
 */
export async function POST(req: Request) {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  try {
    const { searchParams } = new URL(req.url);
    const dryRun = searchParams.get("dryRun") === "true";
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

    // Count before cleanup
    const beforeTotal = await prisma.member.count({
      where: { familyId: family.id },
    });
    const beforeActive = await prisma.member.count({
      where: { familyId: family.id, isActive: true },
    });
    // TODO: Re-enable after prisma generate
    const beforeGhosts = 0; // await prisma.member.count({
    //   where: { familyId: family.id, source: "BANKLOG_GHOST" },
    // });

    const actions: string[] = [];
    let ghostsDeleted = 0;
    let duplicatesDeactivated = 0;

    if (!dryRun) {
      // 1. Delete BANKLOG_GHOST members
      // TODO: Re-enable after prisma generate
      // const deleteResult = await prisma.member.deleteMany({
      //   where: {
      //     familyId: family.id,
      //     source: "BANKLOG_GHOST",
      //   },
      // });
      // ghostsDeleted = deleteResult.count;
      // actions.push(`Deleted ${ghostsDeleted} BANKLOG_GHOST members`);
      actions.push(`[DISABLED] Ghost deletion requires prisma generate first`);

      // 2. Find and deactivate duplicate steamIds
      const steamIdGroups = await prisma.member.groupBy({
        by: ["steamId"],
        where: {
          familyId: family.id,
          steamId: { not: null },
          isActive: true,
        },
        _count: { steamId: true },
        having: { steamId: { _count: { gt: 1 } } },
      });

      for (const group of steamIdGroups) {
        const members = await prisma.member.findMany({
          where: {
            familyId: family.id,
            steamId: group.steamId,
            isActive: true,
          },
          orderBy: { updatedAt: "desc" },
        });

        // Deactivate all except the most recent
        const toDeactivate = members.slice(1);
        if (toDeactivate.length > 0) {
          await prisma.member.updateMany({
            where: {
              id: { in: toDeactivate.map(m => m.id) },
            },
            data: { isActive: false },
          });
          duplicatesDeactivated += toDeactivate.length;
          actions.push(`Deactivated ${toDeactivate.length} duplicate steamId=${group.steamId} (kept most recent)`);
        }
      }

      // 3. Find and deactivate duplicate discordIds
      const discordIdGroups = await prisma.member.groupBy({
        by: ["discordId"],
        where: {
          familyId: family.id,
          discordId: { not: null },
          isActive: true,
        },
        _count: { discordId: true },
        having: { discordId: { _count: { gt: 1 } } },
      });

      for (const group of discordIdGroups) {
        const members = await prisma.member.findMany({
          where: {
            familyId: family.id,
            discordId: group.discordId,
            isActive: true,
          },
          orderBy: { updatedAt: "desc" },
        });

        // Deactivate all except the most recent
        const toDeactivate = members.slice(1);
        if (toDeactivate.length > 0) {
          await prisma.member.updateMany({
            where: {
              id: { in: toDeactivate.map(m => m.id) },
            },
            data: { isActive: false },
          });
          duplicatesDeactivated += toDeactivate.length;
          actions.push(`Deactivated ${toDeactivate.length} duplicate discordId=${group.discordId} (kept most recent)`);
        }
      }
    } else {
      // Dry run: just report what would be done
      actions.push(`[DRY RUN] Would delete ${beforeGhosts} BANKLOG_GHOST members (requires prisma generate)`);

      const steamIdGroups = await prisma.member.groupBy({
        by: ["steamId"],
        where: {
          familyId: family.id,
          steamId: { not: null },
          isActive: true,
        },
        _count: { steamId: true },
        having: { steamId: { _count: { gt: 1 } } },
      });

      let wouldDeactivate = 0;
      for (const group of steamIdGroups) {
        const count = group._count.steamId - 1; // Keep 1, deactivate rest
        wouldDeactivate += count;
      }

      const discordIdGroups = await prisma.member.groupBy({
        by: ["discordId"],
        where: {
          familyId: family.id,
          discordId: { not: null },
          isActive: true,
        },
        _count: { discordId: true },
        having: { discordId: { _count: { gt: 1 } } },
      });

      for (const group of discordIdGroups) {
        const count = group._count.discordId - 1; // Keep 1, deactivate rest
        wouldDeactivate += count;
      }

      actions.push(`[DRY RUN] Would deactivate ${wouldDeactivate} duplicate members`);
    }

    // Count after cleanup
    const afterTotal = await prisma.member.count({
      where: { familyId: family.id },
    });
    const afterActive = await prisma.member.count({
      where: { familyId: family.id, isActive: true },
    });

    return NextResponse.json({
      ok: true,
      dryRun,
      familyId,
      before: {
        total: beforeTotal,
        active: beforeActive,
        ghosts: beforeGhosts,
      },
      after: {
        total: afterTotal,
        active: afterActive,
      },
      changes: {
        ghostsDeleted,
        duplicatesDeactivated,
        totalChanged: ghostsDeleted + duplicatesDeactivated,
      },
      actions,
      message: dryRun 
        ? "Dry run complete - no changes made. Run without dryRun=true to apply changes."
        : "Cleanup complete!",
    });
  } catch (error: any) {
    console.error("[/api/debug/members-cleanup] Error:", error);
    return NextResponse.json({
      ok: false,
      error: "Failed to cleanup members",
      details: error.message || String(error),
    }, { status: 500 });
  }
}
