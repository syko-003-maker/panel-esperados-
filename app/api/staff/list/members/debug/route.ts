import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";
import { requireChefOrEtatMajor } from "@/lib/guards";

/**
 * DEBUG ROUTE: Raw member list
 * GET /api/staff/list/members/debug
 * Protected: requires Chef or Etat-Major
 */
export async function GET() {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;
  try {
    console.log("\n=== DEBUG ROUTE: RAW MEMBER LIST ===");

    // 1. Get all families
    const allFamilies = await prisma.family.findMany({
      select: { id: true, slug: true, name: true }
    });
    console.log(`✓ Families in DB: ${allFamilies.length}`);
    allFamilies.forEach(f => {
      console.log(`  - ${f.slug} (id: ${f.id.substring(0, 8)}...) - ${f.name}`);
    });

    // 2. Resolve familyId
    const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
    console.log(`✓ Resolved familyId: ${familyDbId.substring(0, 8)}...`);

    // 3. Count members by familyId
    const countByFamilyId = await prisma.member.count({
      where: { familyId: familyDbId }
    });
    console.log(`✓ Members with familyId "${familyDbId.substring(0, 8)}...": ${countByFamilyId}`);

    // 4. Count ALL members
    const countAll = await prisma.member.count();
    console.log(`✓ Total members in DB: ${countAll}`);

    // 5. Get all members for this family (NO pagination, NO filters)
    const members = await prisma.member.findMany({
      where: { familyId: familyDbId },
      orderBy: { rpName: "asc" },
      select: {
        id: true,
        discordId: true,
        rpName: true,
        grade: true,
        isActive: true,
        familyId: true,
      }
    });

    console.log(`✓ Retrieved ${members.length} members`);
    if (members.length > 0) {
      console.log(`  First 3:`);
      members.slice(0, 3).forEach(m => {
        console.log(`    - ${m.rpName} (Discord: ${m.discordId}, Active: ${m.isActive})`);
      });
    }

    // 6. Check if any members have different familyId
    const allMemberFamilyIds = await prisma.member.findMany({
      distinct: ["familyId"],
      select: { familyId: true }
    });
    console.log(`✓ Distinct familyIds in members:`, allMemberFamilyIds.map(m => m.familyId.substring(0, 8) + "..."));

    console.log("=== END DEBUG ===\n");

    return NextResponse.json({
      ok: true,
      debug: {
        resolvedFamilyDbId: familyDbId,
        defaultFamilyId: DEFAULT_FAMILY_ID,
        allFamilies,
        totalMembers: countAll,
        membersByFamilyId: countByFamilyId,
        membersSample: members.slice(0, 10),
        memberCount: members.length,
        distinctFamilyIds: allMemberFamilyIds
      }
    });
  } catch (error: any) {
    console.error("DEBUG ERROR:", error);
    return NextResponse.json({
      ok: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
