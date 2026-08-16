import { NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/db";
import { requireStaffAccess, canAccessStaffPanel, getStaffUser } from "@/lib/rbac";
import { getUserDiscordIdFromSession } from "@/server/auth/discord";
import { getDiscordRolesForUser } from "@/lib/discord-roles";
import { toFamilyCuid } from "@/lib/family";

/**
 * GET /api/debug/rbac
 * 
 * Debug endpoint to inspect RBAC configuration
 * Shows:
 * - All StaffRoles with Discord role mappings & permissions
 * - All StaffPermissions by category
 * - All StaffUsers with their roles
 * - Environment variables configuration
 * - Summary statistics
 * 
 * Accessible in development OR requires authenticated session in production
 */
export async function GET() {
  try {
    const session = await getSession();
    const guard = await requireStaffAccess();
    if (guard instanceof Response) return guard;

    const discordId = session ? await getUserDiscordIdFromSession(session) : null;
    const rolesDiscord = discordId ? await getDiscordRolesForUser(discordId) : [];
    const decision = session ? await canAccessStaffPanel(session, "esperados") : { canAccess: false, source: "NONE", staffUser: null };
    const staffUser = session ? await getStaffUser(session, "esperados") : null;

    // Get all staff roles with permissions
    const staffRoles = await prisma.staffRole.findMany({
      where: { familyId: await toFamilyCuid("esperados") },
      include: {
        permissions: {
          include: {
            permission: true,
          },
        },
        _count: {
          select: { staffUsers: true },
        },
      },
      orderBy: { priority: "desc" },
    });

    // Get all permissions grouped by category
    const staffPermissions = await prisma.staffPermission.findMany({
      orderBy: [{ category: "asc" }, { code: "asc" }],
    });

    // Get all staff users
    const staffUsers = await prisma.staffUser.findMany({
      where: { familyId: await toFamilyCuid("esperados") },
      include: {
        role: {
          select: {
            code: true,
            name: true,
            priority: true,
            discordRoleId: true,
          },
        },
      },
      orderBy: { discordId: "asc" },
    });

    // Environment config
    const envConfig = {
      DISCORD_STAFF_FULL_ROLE_IDS: (process.env.DISCORD_STAFF_FULL_ROLE_IDS ?? "").split(",").filter(Boolean),
      DISCORD_RECRUITER_ROLE_IDS: (process.env.DISCORD_RECRUITER_ROLE_IDS ?? "").split(",").filter(Boolean),
      ADMIN_DISCORD_IDS: (process.env.ADMIN_DISCORD_IDS ?? "").split(",").filter(Boolean),
      STAFF_DISCORD_IDS: (process.env.STAFF_DISCORD_IDS ?? "").split(",").filter(Boolean),
      CHEF_DISCORD_IDS: (process.env.CHEF_DISCORD_IDS ?? "").split(",").filter(Boolean),
      CHEF_FAMILLE_ROLE_ID: process.env.CHEF_FAMILLE_ROLE_ID ?? "",
      ETAT_MAJOR_ROLE_ID: process.env.ETAT_MAJOR_ROLE_ID ?? "",
      RECRUTEUR_ROLE_ID: process.env.RECRUTEUR_ROLE_ID ?? "",
    };

    // Group permissions by category
    const permissionsByCategory = staffPermissions.reduce((acc, p) => {
      const category = p.category ?? "OTHER";
      if (!acc[category]) acc[category] = [];
      acc[category].push({
        code: p.code,
        name: p.name,
        description: p.description,
      });
      return acc;
    }, {} as Record<string, Array<{ code: string; name: string; description: string | null }>>);

    return NextResponse.json({
      ok: true,
      data: {
        session: {
          discordId,
          userId: session?.user?.id ?? null,
        },
        decision,
        rolesDiscord,
        staffUser,
        // Database RBAC - Roles
        staffRoles: staffRoles.map(role => ({
          id: role.id,
          code: role.code,
          name: role.name,
          priority: role.priority,
          discordRoleId: role.discordRoleId,
          isActive: role.isActive,
          permissions: role.permissions.map(rp => ({
            code: rp.permission.code,
            name: rp.permission.name,
            category: rp.permission.category,
          })),
          userCount: role._count.staffUsers,
        })),
        
        // Database RBAC - Permissions by Category
        permissionsByCategory,
        
        // Database RBAC - Staff Users
        staffUsers: staffUsers.map(u => ({
          id: u.id,
          discordId: u.discordId,
          userId: u.userId,
          roleCode: u.role.code,
          roleName: u.role.name,
          rolePriority: u.role.priority,
          roleDiscordId: u.role.discordRoleId,
          isActive: u.isActive,
        })),
        
        // Environment config (legacy system)
        envConfig: {
          staffFullRoleIds: envConfig.DISCORD_STAFF_FULL_ROLE_IDS,
          recruiterRoleIds: envConfig.DISCORD_RECRUITER_ROLE_IDS,
          adminIds: envConfig.ADMIN_DISCORD_IDS,
          staffIds: envConfig.STAFF_DISCORD_IDS,
          chefIds: envConfig.CHEF_DISCORD_IDS,
          chefRoleId: envConfig.CHEF_FAMILLE_ROLE_ID,
          etatMajorRoleId: envConfig.ETAT_MAJOR_ROLE_ID,
          recruiterRoleId: envConfig.RECRUTEUR_ROLE_ID,
        },
        
        // Summary Statistics
        summary: {
          totalRoles: staffRoles.length,
          activeRoles: staffRoles.filter(r => r.isActive).length,
          rolesWithDiscordMapping: staffRoles.filter(r => r.discordRoleId).length,
          totalPermissions: staffPermissions.length,
          permissionCategories: Object.keys(permissionsByCategory).length,
          totalStaffUsers: staffUsers.length,
          activeStaffUsers: staffUsers.filter(u => u.isActive).length,
          usersWithLinkedUserId: staffUsers.filter(u => u.userId).length,
        },

        // Diagnostic Info
        diagnostic: {
          hasDbRoles: staffRoles.length > 0,
          hasDbPermissions: staffPermissions.length > 0,
          hasDbStaffUsers: staffUsers.length > 0,
          hasLegacyEnvVars: envConfig.ADMIN_DISCORD_IDS.length > 0 || envConfig.STAFF_DISCORD_IDS.length > 0,
          hasDiscordRoleMapping: staffRoles.some(r => r.discordRoleId),
          recommendedAction: staffRoles.length === 0 ? "RUN_SEED_RBAC" :
                            staffUsers.length === 0 ? "CREATE_STAFF_USERS" :
                            !staffRoles.some(r => r.discordRoleId) ? "MAP_DISCORD_ROLES_TO_DB_ROLES" :
                            "OK",
        },
      },
    });
  } catch (error) {
    console.error("[/api/debug/rbac] Error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "INTERNAL_ERROR",
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
