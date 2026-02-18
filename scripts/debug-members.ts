import { prisma } from "../src/lib/db.js";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "../src/lib/family.js";

async function debugMembers() {
  try {
    console.log("\n=== DATABASE DEBUG ===\n");

    // 1. Families
    const families = await prisma.family.findMany({
      select: { id: true, slug: true, name: true }
    });
    console.log("📋 Families:");
    families.forEach(f => {
      console.log(`  ✓ ${f.slug} → id: ${f.id.substring(0, 8)}... (${f.name})`);
    });

    // 2. Resolve
    const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
    console.log(`\n🔍 Resolved familyId:`);
    console.log(`  slug: "${DEFAULT_FAMILY_ID}" → cuid: "${familyDbId.substring(0, 8)}..."`);

    // 3. Member counts
    const totalCount = await prisma.member.count();
    const familyCount = await prisma.member.count({ where: { familyId: familyDbId } });
    console.log(`\n📊 Member counts:`);
    console.log(`  Total in DB: ${totalCount}`);
    console.log(`  With familyId="${familyDbId.substring(0, 8)}...": ${familyCount}`);

    // 4. Sample members - ALL FIELDS
    const samples = await prisma.member.findMany({
      where: { familyId: familyDbId },
      take: 3
    });
    console.log(`\n👥 Sample members (ALL FIELDS):`);
    samples.forEach((m, i) => {
      console.log(`  ${i + 1}. Member:`, JSON.stringify(m, null, 2));
    });

    // 5. Check all distinct familyIds
    const allFamilyIds = await prisma.member.findMany({
      distinct: ["familyId"],
      select: { familyId: true }
    });
    console.log(`\n🏷️  Distinct familyIds in members:`);
    allFamilyIds.forEach(m => {
      console.log(`  - ${m.familyId.substring(0, 8)}...`);
    });

    console.log("\n=== END DEBUG ===\n");

  } catch (error) {
    console.error("ERROR:", error);
  } finally {
    await prisma.$disconnect();
  }
}

debugMembers();
