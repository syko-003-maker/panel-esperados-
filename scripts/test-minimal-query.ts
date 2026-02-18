import { prisma } from "../src/lib/db.js";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "../src/lib/family.js";

async function testQuery() {
  console.log("\n=== MINIMAL QUERY TEST ===\n");

  // 1. Get familyDbId
  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  console.log(`Resolved familyId: ${familyDbId.substring(0, 8)}...`);

  // 2. Simple raw query
  const count = await prisma.member.count({
    where: { familyId: familyDbId }
  });
  console.log(`Count with family filter: ${count}`);

  // 3. Actual query like /api/staff/list/members does (offset pagination)
  const pageSize = 20;
  const skip = 0;
  const items = await prisma.member.findMany({
    where: { familyId: familyDbId },
    orderBy: [{ gradeLevel: "desc" }, { rpName: "asc" }],
    take: pageSize,
    skip,
    select: {
      id: true,
      discordId: true,
      steamId: true,
      rpName: true,
      grade: true,
      gradeLevel: true,
      isActive: true,
      joinedAt: true,
      createdAt: true,
    },
  });

  const total = await prisma.member.count({ where: { familyId: familyDbId } });

  console.log(`\nOffset pagination result:`);
  console.log(`- total: ${total}`);
  console.log(`- pageSize: ${pageSize}`);
  console.log(`- returned: ${items.length}`);
  console.log(`- expected: ${Math.min(pageSize, total)}`);

  if (items.length > 0) {
    console.log(`\nFirst item:`, items[0]);
  }

  console.log("\n=== END TEST ===\n");

  process.exit(items.length === Math.min(pageSize, total) ? 0 : 1);
}

testQuery().catch(err => {
  console.error("ERROR:", err);
  process.exit(1);
});
