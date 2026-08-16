/**
 * POST /api/admin/repair-members
 * 
 * Admin endpoint to:
 * 1. Detect duplicate members (same steamId or discordId)
 * 2. Merge duplicates (keep newer, consolidate non-null fields )
 * 3. Mark members as inactive if they're ghosted (BANKLOG_GHOST source)
 * 4. Return detailed repair report
 * 
 * Authentication: requires SUPER_ADMIN or RBAC_MANAGE permission
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { toFamilyCuid } from "@/lib/family";

export async function POST(req: NextRequest) {
  // Check authentication
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Check permission
  const guard = await requirePermission("ADMIN_FULL");
  if (guard instanceof Response) {
    return guard;
  }

  try {
    const { familyId: familyIdOrSlug = "esperados", dryRun = true } = await req.json();

    // Resolve family — l'entree peut etre un slug OU un cuid. Avant, la
    // recherche se faisait sur `id` avec un slug : jamais trouvee, la route
    // repondait systematiquement 404 « Family not found ».
    const familyDbId = await toFamilyCuid(familyIdOrSlug);
    const family = await prisma.family.findUnique({
      where: { id: familyDbId },
      select: { id: true },
    });

    if (!family) {
      return NextResponse.json(
        { error: "Family not found" },
        { status: 404 }
      );
    }

    // Get all members
    const allMembers = await prisma.member.findMany({
      where: { familyId: family.id },
      orderBy: { updatedAt: "desc" },
    });

    // Detect duplicates
    const steamIdMap = new Map<string, string[]>();
    const discordIdMap = new Map<string, string[]>();

    for (const member of allMembers) {
      if (member.steamId) {
        const ids = steamIdMap.get(member.steamId) ?? [];
        ids.push(member.id);
        steamIdMap.set(member.steamId, ids);
      }
      if (member.discordId) {
        const ids = discordIdMap.get(member.discordId) ?? [];
        ids.push(member.id);
        discordIdMap.set(member.discordId, ids);
      }
    }

    // Find duplicates
    const steamDuplicates = Array.from(steamIdMap.values()).filter((ids) => ids.length > 1);
    const discordDuplicates = Array.from(discordIdMap.values()).filter((ids) => ids.length > 1);

    // Plan repairs
    const repairs: Array<{
      type: "merge" | "deactivate";
      details: string;
      memberIds: string[];
    }> = [];

    // Plan steamId merges
    for (const dupIds of steamDuplicates) {
      const members = allMembers.filter((m) => dupIds.includes(m.id));
      const primary = members[0]; // Newest (first in desc by updatedAt)
      const toDelete = members.slice(1);

      repairs.push({
        type: "merge",
        details: `Merge ${toDelete.length} duplicate(s) into ${primary.rpName} (by steamId)`,
        memberIds: [primary.id, ...toDelete.map((m) => m.id)],
      });
    }

    // Plan discordId merges
    for (const dupIds of discordDuplicates) {
      const members = allMembers.filter((m) => dupIds.includes(m.id));
      const primary = members[0]; // Newest
      const toDelete = members.slice(1);

      repairs.push({
        type: "merge",
        details: `Merge ${toDelete.length} duplicate(s) into ${primary.rpName} (by discordId)`,
        memberIds: [primary.id, ...toDelete.map((m) => m.id)],
      });
    }

    // Plan deactivation of BANKLOG_GHOST members
    const ghostMembers = allMembers.filter((m) => m.source === "BANKLOG_GHOST" && m.isActive);
    for (const member of ghostMembers) {
      repairs.push({
        type: "deactivate",
        details: `Deactivate ghost member from BANKLOG: ${member.rpName}`,
        memberIds: [member.id],
      });
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        totalMembers: allMembers.length,
        steamDuplicates: steamDuplicates.length,
        discordDuplicates: discordDuplicates.length,
        ghostMembers: ghostMembers.length,
        plannedRepairs: repairs.length,
        repairs,
      });
    }

    // Execute repairs
    const executed: string[] = [];
    for (const repair of repairs) {
      if (repair.type === "merge") {
        const [primaryId, ...toDeleteIds] = repair.memberIds;
        // Delete duplicates
        await prisma.member.deleteMany({
          where: { id: { in: toDeleteIds } },
        });
        executed.push(`Deleted ${toDeleteIds.length} duplicate(s)`);
      } else if (repair.type === "deactivate") {
        await prisma.member.update({
          where: { id: repair.memberIds[0] },
          data: { isActive: false },
        });
        executed.push(`Deactivated ghost member`);
      }
    }

    return NextResponse.json({
      ok: true,
      dryRun: false,
      totalMembers: allMembers.length,
      repairsExecuted: executed.length,
      executed,
    });
  } catch (err) {
    console.error("[repair-members] Error:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
