import { prisma } from "./src/lib/db";

async function testMemberList() {
  try {
    console.log("\n=== DATABASE STATE CHECK ===\n");

    // Check Family
    const families = await prisma.family.findMany({
      select: { id: true, slug: true, name: true }
    });
    console.log(`✓ Families in DB: ${families.length}`);
    families.forEach(f => {
      console.log(`  - ${f.slug} (id: ${f.id.substring(0, 8)}...) - ${f.name}`);
    });

    if (families.length === 0) {
      console.log("  ⚠️  NO FAMILIES FOUND - This is the root cause!");
    }

    // Check Member count
    const totalMembers = await prisma.member.count();
    console.log(`\n✓ Total members in DB: ${totalMembers}`);

    if (totalMembers > 0) {
      // Get sample members
      const sampleMembers = await prisma.member.findMany({
        take: 3,
        select: { 
          id: true, 
          familyId: true, 
          discordId: true, 
          rpName: true,
          isActive: true
        }
      });

      console.log(`\n✓ Sample members:`);
      sampleMembers.forEach((m, idx) => {
        console.log(`  ${idx + 1}. ${m.rpName} (Discord: ${m.discordId}, Active: ${m.isActive})`);
        console.log(`     familyId: ${m.familyId.substring(0, 8)}...`);
      });

      // Check Family-Member relationship
      if (sampleMembers.length > 0) {
        const memberFamily = await prisma.family.findUnique({
          where: { id: sampleMembers[0].familyId },
          select: { id: true, slug: true }
        });
        console.log(`\n✓ Family from first member:`);
        console.log(`  - Slug: ${memberFamily?.slug}`);
        console.log(`  - ID: ${memberFamily?.id.substring(0, 8)}...`);
      }

      // Now test the query pattern used by the API
      console.log(`\n=== API QUERY TEST ===\n`);
      
      if (families.length > 0) {
        const familyDbId = families[0].id;
        const queryResult = await prisma.member.findMany({
          where: { familyId: familyDbId },
          orderBy: [{ gradeLevel: "desc" }, { rpName: "asc" }],
          take: 10,
          select: {
            id: true,
            discordId: true,
            rpName: true,
            isActive: true
          }
        });

        console.log(`✓ Query with familyId (cuid) returned: ${queryResult.length} members`);
        
        if (queryResult.length > 0) {
          console.log(`  Expected: ✅ WORKING (members match)`);
          queryResult.slice(0, 3).forEach(m => {
            console.log(`    - ${m.rpName}`);
          });
        } else {
          console.log(`  Expected: 55 members`);
          console.log(`  Got: 0 members`);
          console.log(`  ❌ PROBLEM: familyId query returned nothing!`);
        }
      }
    } else {
      console.log("  ⚠️  NO MEMBERS FOUND - Has sync been run?");
    }

    console.log("\n=== END OF CHECK ===\n");
  } catch (error) {
    console.error("ERROR:", error);
  } finally {
    await prisma.$disconnect();
  }
}

testMemberList();
