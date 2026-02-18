/**
 * RBAC Seed Script
 * Creates default roles and permissions
 *
 * Run with: npx tsx prisma/seed-rbac.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DEFAULT_FAMILY_ID = "esperados";

// ─────────────────────────────────────────────────────────────
// Permissions
// ─────────────────────────────────────────────────────────────

const PERMISSIONS = [
  // Tickets
  { code: "TICKETS_VIEW", name: "View Tickets", category: "tickets", description: "View recruitment and complaint tickets" },
  { code: "TICKETS_CLOSE", name: "Close Tickets", category: "tickets", description: "Close/resolve tickets" },
  { code: "TICKETS_ASSIGN", name: "Assign Tickets", category: "tickets", description: "Assign tickets to staff" },

  // Sanctions
  { code: "SANCTIONS_VIEW", name: "View Sanctions", category: "sanctions", description: "View all sanctions" },
  { code: "SANCTIONS_CREATE", name: "Create Sanctions", category: "sanctions", description: "Create new sanctions" },
  { code: "SANCTIONS_CLOSE", name: "Close Sanctions", category: "sanctions", description: "Close/lift sanctions" },

  // Meetings
  { code: "MEETINGS_VIEW", name: "View Meetings", category: "meetings", description: "View meetings and attendance" },
  { code: "MEETINGS_EDIT", name: "Edit Meetings", category: "meetings", description: "Edit meeting details and attendance" },
  { code: "MEETINGS_FINALIZE", name: "Finalize Meetings", category: "meetings", description: "Finalize meetings and apply decisions" },

  // Members
  { code: "MEMBERS_VIEW", name: "View Members", category: "members", description: "View member profiles" },
  { code: "MEMBERS_EDIT", name: "Edit Members", category: "members", description: "Edit member profiles" },
  { code: "MEMBERS_IMPORT", name: "Import Members", category: "members", description: "Import members from CSV" },
  { code: "LINK_MANAGE", name: "Manage Links", category: "members", description: "Link/unlink member accounts (steamId <-> discordId)" },

  // Activity
  { code: "ACTIVITY_VIEW", name: "View Activity", category: "activity", description: "View activity reports" },
  { code: "ACTIVITY_MANAGE", name: "Manage Activity", category: "activity", description: "Manage activity rules and compute" },

  // Absences
  { code: "ABSENCES_VIEW", name: "View Absences", category: "absences", description: "View absence requests" },
  { code: "ABSENCES_MANAGE", name: "Manage Absences", category: "absences", description: "Approve/reject absences" },

  // Stats
  { code: "STATS_VIEW", name: "View Statistics", category: "stats", description: "View bank logs, activity stats, and analytics" },

  // Discord
  { code: "DISCORD_CONFIG", name: "Discord Config", category: "discord", description: "Configure Discord integration" },
  { code: "DISCORD_SYNC", name: "Discord Sync", category: "discord", description: "Trigger Discord synchronization" },

  // Audit
  { code: "AUDIT_VIEW", name: "View Audit Logs", category: "audit", description: "View audit trail" },

  // Admin
  { code: "ADMIN_FULL", name: "Full Admin", category: "admin", description: "Full administrative access" },
];

// ─────────────────────────────────────────────────────────────
// Roles
// ─────────────────────────────────────────────────────────────

const ROLES = [
  {
    code: "ADMIN",
    name: "Administrateur",
    description: "Full administrative access to all features",
    priority: 100,
    color: "#FF0000",
    permissions: ["ADMIN_FULL"], // Grants all permissions
  },
  {
    code: "CHEF",
    name: "Chef de Famille",
    description: "Family leadership with meeting finalization rights",
    priority: 90,
    color: "#FFD700",
    permissions: [
      "TICKETS_VIEW", "TICKETS_CLOSE", "TICKETS_ASSIGN",
      "SANCTIONS_VIEW", "SANCTIONS_CREATE", "SANCTIONS_CLOSE",
      "MEETINGS_VIEW", "MEETINGS_EDIT", "MEETINGS_FINALIZE",
      "MEMBERS_VIEW", "MEMBERS_EDIT", "MEMBERS_IMPORT",
      "LINK_MANAGE",
      "ACTIVITY_VIEW", "ACTIVITY_MANAGE",
      "ABSENCES_VIEW", "ABSENCES_MANAGE",
      "STATS_VIEW",
      "DISCORD_CONFIG", "DISCORD_SYNC",
      "AUDIT_VIEW",
    ],
  },
  {
    code: "WL1",
    name: "Whitelist 1",
    description: "Senior staff with broad access",
    priority: 80,
    color: "#9B59B6",
    permissions: [
      "TICKETS_VIEW", "TICKETS_CLOSE", "TICKETS_ASSIGN",
      "SANCTIONS_VIEW", "SANCTIONS_CREATE",
      "MEETINGS_VIEW", "MEETINGS_EDIT",
      "MEMBERS_VIEW", "MEMBERS_EDIT",
      "LINK_MANAGE",
      "ACTIVITY_VIEW",
      "ABSENCES_VIEW", "ABSENCES_MANAGE",
      "STATS_VIEW",
      "AUDIT_VIEW",
    ],
  },
  {
    code: "WL2",
    name: "Whitelist 2",
    description: "Staff with ticket and meeting access",
    priority: 70,
    color: "#3498DB",
    permissions: [
      "TICKETS_VIEW", "TICKETS_CLOSE",
      "SANCTIONS_VIEW",
      "MEETINGS_VIEW", "MEETINGS_EDIT",
      "MEMBERS_VIEW",
      "ACTIVITY_VIEW",
      "ABSENCES_VIEW",
      "STATS_VIEW",
    ],
  },
  {
    code: "RECRUITER",
    name: "Recruteur",
    description: "Recruitment ticket management only",
    priority: 50,
    color: "#2ECC71",
    permissions: [
      "TICKETS_VIEW", "TICKETS_CLOSE",
      "MEMBERS_VIEW",
    ],
  },
  {
    code: "MOD",
    name: "Modérateur",
    description: "Moderation and sanctions focus",
    priority: 60,
    color: "#E67E22",
    permissions: [
      "TICKETS_VIEW", "TICKETS_CLOSE",
      "SANCTIONS_VIEW", "SANCTIONS_CREATE", "SANCTIONS_CLOSE",
      "MEMBERS_VIEW",
      "ABSENCES_VIEW",
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// Seed Function
// ─────────────────────────────────────────────────────────────

async function seedRbac() {
  console.log("🔐 Seeding RBAC...\n");

  // 1. Create permissions
  console.log("Creating permissions...");
  for (const perm of PERMISSIONS) {
    await prisma.staffPermission.upsert({
      where: { code: perm.code },
      update: { name: perm.name, description: perm.description, category: perm.category },
      create: perm,
    });
    console.log(`  ✓ ${perm.code}`);
  }

  // Get all permissions for mapping
  const allPermissions = await prisma.staffPermission.findMany();
  const permissionMap = new Map(allPermissions.map((p) => [p.code, p.id]));

  // 2. Create roles
  console.log("\nCreating roles...");
  for (const role of ROLES) {
    const { permissions, ...roleData } = role;

    // Upsert role
    const dbRole = await prisma.staffRole.upsert({
      where: { familyId_code: { familyId: DEFAULT_FAMILY_ID, code: role.code } },
      update: {
        name: roleData.name,
        description: roleData.description,
        priority: roleData.priority,
        color: roleData.color,
      },
      create: {
        familyId: DEFAULT_FAMILY_ID,
        ...roleData,
      },
    });

    console.log(`  ✓ ${role.code} (priority: ${role.priority})`);

    // Assign permissions
    for (const permCode of permissions) {
      const permId = permissionMap.get(permCode);
      if (!permId) {
        console.log(`    ⚠ Permission ${permCode} not found`);
        continue;
      }

      await prisma.staffRolePermission.upsert({
        where: { roleId_permissionId: { roleId: dbRole.id, permissionId: permId } },
        update: {},
        create: { roleId: dbRole.id, permissionId: permId },
      });
    }
    console.log(`    → ${permissions.length} permissions assigned`);
  }

  // 3. Summary
  const roleCount = await prisma.staffRole.count({ where: { familyId: DEFAULT_FAMILY_ID } });
  const permCount = await prisma.staffPermission.count();
  const mappingCount = await prisma.staffRolePermission.count();

  console.log("\n✅ RBAC seed complete!");
  console.log(`   Roles: ${roleCount}`);
  console.log(`   Permissions: ${permCount}`);
  console.log(`   Role-Permission mappings: ${mappingCount}`);
}

// Run
seedRbac()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
