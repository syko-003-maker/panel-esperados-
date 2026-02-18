/**
 * One-time reconciliation script: Sync member isActive state with LYG
 * 
 * Purpose: Ensures DB active member count matches LYG reality
 * - Activates members present in LYG
 * - Deactivates members not in LYG or with null steamId
 * 
 * Usage:
 *   npx tsx scripts/reconcile-lyg-actives.ts
 * 
 * Safe to run multiple times (idempotent).
 */

import { PrismaClient } from "@prisma/client";
import { lygFetchMembers, normalizeLygMember } from "../src/lib/lyg-client";
import { normalizeSteamId64 } from "../src/lib/validation/steamid";

const prisma = new PrismaClient();

const DEFAULT_FAMILY_ID = process.env.FAMILY_ID ?? "esperados";
const DEFAULT_FAMILY_NAME = process.env.FAMILY_NAME ?? "Los Esperados";

async function main() {
  console.log("🔄 Starting LYG Active Members Reconciliation...\n");

  // 1. Resolve family cuid
  const family = await prisma.family.findUnique({
    where: { slug: DEFAULT_FAMILY_ID },
    select: { id: true, slug: true, name: true },
  });

  if (!family) {
    console.error(`❌ Family not found: ${DEFAULT_FAMILY_ID}`);
    process.exit(1);
  }

  console.log(`📁 Family: ${family.name} (${family.slug})`);
  console.log(`   ID: ${family.id}\n`);

  // 2. Get current DB state (before)
  const beforeActive = await prisma.member.count({
    where: { familyId: family.id, isActive: true },
  });
  const beforeInactive = await prisma.member.count({
    where: { familyId: family.id, isActive: false },
  });
  const beforeTotal = beforeActive + beforeInactive;

  console.log("📊 Current DB State (BEFORE):");
  console.log(`   Total members: ${beforeTotal}`);
  console.log(`   Active: ${beforeActive}`);
  console.log(`   Inactive: ${beforeInactive}\n`);

  // 3. Fetch members from LYG
  console.log("🌐 Fetching members from LYG...");
  const membersResponse = await lygFetchMembers(DEFAULT_FAMILY_NAME, {
    timeoutMs: 60_000,
  });

  if (!membersResponse.ok || !membersResponse.data) {
    console.error("❌ Failed to fetch members from LYG:", membersResponse.error);
    process.exit(1);
  }

  const extractedMembers = membersResponse.data || [];
  console.log(`✅ Fetched ${extractedMembers.length} members from LYG\n`);

  // 4. Normalize and extract steamIds
  const normalizedMembers = extractedMembers
    .map(item => normalizeLygMember(item, DEFAULT_FAMILY_ID))
    .filter(member => member !== null);

  const activeSteamIds = normalizedMembers
    .map(m => m!.steamId64)
    .filter((id): id is string => !!id && normalizeSteamId64(id) !== null)
    .map(id => normalizeSteamId64(id)!)
    .filter((id, index, arr) => arr.indexOf(id) === index); // unique

  console.log("📋 LYG Active Members:");
  console.log(`   Normalized: ${normalizedMembers.length}`);
  console.log(`   Valid steamIds: ${activeSteamIds.length}\n`);

  if (activeSteamIds.length === 0) {
    console.error("⚠️  No valid steamIds found in LYG response. Aborting.");
    process.exit(1);
  }

  // 5. Reconcile with transaction
  console.log("🔄 Reconciling active state...");

  const reconcileResult = await prisma.$transaction(async (tx) => {
    // Activate members IN LYG list
    const activated = await tx.member.updateMany({
      where: {
        familyId: family.id,
        steamId: { in: activeSteamIds },
        isActive: false, // Only update if currently inactive
      },
      data: { isActive: true },
    });

    // Deactivate members NOT IN LYG list (or null steamId)
    const deactivated = await tx.member.updateMany({
      where: {
        familyId: family.id,
        OR: [
          { steamId: null },
          { steamId: { notIn: activeSteamIds } },
        ],
        isActive: true, // Only update if currently active
      },
      data: { isActive: false },
    });

    return { activated: activated.count, deactivated: deactivated.count };
  });

  console.log("✅ Reconciliation complete!\n");
  console.log(`   Activated: ${reconcileResult.activated} members`);
  console.log(`   Deactivated: ${reconcileResult.deactivated} members\n`);

  // 6. Get new DB state (after)
  const afterActive = await prisma.member.count({
    where: { familyId: family.id, isActive: true },
  });
  const afterInactive = await prisma.member.count({
    where: { familyId: family.id, isActive: false },
  });
  const afterTotal = afterActive + afterInactive;

  console.log("📊 New DB State (AFTER):");
  console.log(`   Total members: ${afterTotal}`);
  console.log(`   Active: ${afterActive} (LYG: ${activeSteamIds.length})`);
  console.log(`   Inactive: ${afterInactive}\n`);

  // 7. Verification
  if (afterActive === activeSteamIds.length) {
    console.log("✅ SUCCESS: Active members count matches LYG!");
  } else {
    console.log(`⚠️  WARNING: Mismatch detected!`);
    console.log(`   Expected (LYG): ${activeSteamIds.length}`);
    console.log(`   Actual (DB): ${afterActive}`);
    console.log(`   Difference: ${Math.abs(afterActive - activeSteamIds.length)}`);
  }

  console.log("\n✨ Reconciliation complete!");
}

main()
  .catch((err) => {
    console.error("❌ Script failed:", err);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
