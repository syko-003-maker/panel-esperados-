import { NextResponse } from "next/server";
import { getSession } from "@/auth";
import { getStaffUser } from "@/lib/rbac";
import { getUserDiscordIdFromSession } from "@/server/auth/discord";
import { getDiscordRolesForUser, isRecruiter, isStaffFull } from "@/lib/discord-roles";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";

/**
 * GET /api/me/roles
 * 
 * Debug endpoint to show user's roles and permissions
 * Returns:
 * - discordId (from session + Account table)
 * - Discord roles (live from Discord API)
 * - isStaff/isChef from session
 * - StaffUser info from DB (if exists)
 * - Member info from DB (if exists)
 * - Computed permissions and access flags
 * - Environment config summary
 */
export async function GET() {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json({
        ok: false,
        error: "NOT_AUTHENTICATED",
        data: null,
      }, { status: 401 });
    }

    // Extract basic session info
    const userId = (session as any)?.userId ?? (session as any)?.user?.id;
    const sessionDiscordId = (session as any)?.discordId ?? (session as any)?.user?.discordId;
    const isStaffSession = (session as any)?.isStaff ?? (session as any)?.user?.isStaff ?? false;
    const isChefSession = (session as any)?.isChef ?? (session as any)?.user?.isChef ?? false;

    // Get Discord ID from Account table
    const discordId = await getUserDiscordIdFromSession(session);

    // Get Discord roles (live from Discord API)
    let discordRoles: string[] = [];
    let discordRolesError: string | null = null;
    if (discordId) {
      try {
        discordRoles = await getDiscordRolesForUser(discordId);
      } catch (error) {
        discordRolesError = error instanceof Error ? error.message : String(error);
      }
    }

    // Get StaffUser from DB (RBAC)
    const staffUser = await getStaffUser(session);

    // Get Member from DB
    const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
    const member = discordId ? await prisma.member.findFirst({
      where: { familyId: familyDbId, discordId },
      select: {
        id: true,
        rpName: true,
        steamId: true,
        isActive: true,
        grade: true,
        gradeLevel: true,
      },
    }) : null;

    // Environment variables (IDs only, not tokens)
    const envConfig = {
      ADMIN_DISCORD_IDS: (process.env.ADMIN_DISCORD_IDS ?? "").split(",").filter(Boolean),
      STAFF_DISCORD_IDS: (process.env.STAFF_DISCORD_IDS ?? "").split(",").filter(Boolean),
      CHEF_DISCORD_IDS: (process.env.CHEF_DISCORD_IDS ?? "").split(",").filter(Boolean),
      CHEF_FAMILLE_ROLE_ID: process.env.CHEF_FAMILLE_ROLE_ID ?? "",
      ETAT_MAJOR_ROLE_ID: process.env.ETAT_MAJOR_ROLE_ID ?? "",
      RECRUTEUR_ROLE_ID: process.env.RECRUTEUR_ROLE_ID ?? "",
      DISCORD_STAFF_FULL_ROLE_IDS: (process.env.DISCORD_STAFF_FULL_ROLE_IDS ?? "").split(",").filter(Boolean),
      DISCORD_RECRUITER_ROLE_IDS: (process.env.DISCORD_RECRUITER_ROLE_IDS ?? "").split(",").filter(Boolean),
    };

    // Compute legacy access flags
    const hasAdminAccess = envConfig.ADMIN_DISCORD_IDS.includes(discordId ?? "");
    const hasStaffAllowlist = envConfig.STAFF_DISCORD_IDS.includes(discordId ?? "");
    const hasChefAllowlist = envConfig.CHEF_DISCORD_IDS.includes(discordId ?? "");
    const hasChefRole = discordRoles.includes(envConfig.CHEF_FAMILLE_ROLE_ID);
    const hasEtatMajorRole = discordRoles.includes(envConfig.ETAT_MAJOR_ROLE_ID);
    const hasRecruiterRole = discordRoles.includes(envConfig.RECRUTEUR_ROLE_ID);
    const recruiter = isRecruiter(discordRoles);
    const staffFull = isStaffFull(discordRoles);

    return NextResponse.json({
      ok: true,
      data: {
        // Session Info
        session: {
          userId,
          discordId: sessionDiscordId,
          isStaff: isStaffSession,
          isChef: isChefSession,
        },
        
        // Discord Info
        discord: {
          discordId,
          roles: discordRoles,
          rolesError: discordRolesError,
          rolesCount: discordRoles.length,
        },
        
        // StaffUser DB Info (RBAC)
        staffUser: staffUser ? {
          id: staffUser.id,
          roleCode: staffUser.roleCode,
          roleName: staffUser.roleName,
          rolePriority: staffUser.rolePriority,
          permissions: staffUser.permissions,
          permissionsCount: staffUser.permissions.length,
        } : null,
        
        // Member DB Info
        member: member ? {
          id: member.id,
          rpName: member.rpName,
          steamId: member.steamId,
          isActive: member.isActive,
          grade: member.grade,
          gradeLevel: member.gradeLevel,
        } : null,

        // Legacy Access Flags (from env vars + Discord roles)
        legacyAccess: {
          hasAdminAccess,
          hasStaffAllowlist,
          hasChefAllowlist,
          hasChefRole,
          hasEtatMajorRole,
          hasRecruiterRole,
          isRecruiter: recruiter,
          isStaffFull: staffFull,
        },

        // RBAC Access Flags (from DB)
        rbacAccess: {
          hasStaffUserDB: !!staffUser,
          hasMemberDB: !!member,
          canAccessStaffPanel: !!staffUser || isStaffSession,
        },

        // Permissions Detail
        permissions: staffUser ? {
          codes: staffUser.permissions,
          canViewTickets: staffUser.permissions.includes("TICKETS_VIEW"),
          canViewSanctions: staffUser.permissions.includes("SANCTIONS_VIEW"),
          canViewMembers: staffUser.permissions.includes("MEMBERS_VIEW"),
          canViewActivity: staffUser.permissions.includes("ACTIVITY_VIEW"),
          isAdmin: staffUser.permissions.includes("ADMIN_FULL"),
        } : null,

        // Environment Config Summary (redacted)
        envConfig: {
          adminIdsCount: envConfig.ADMIN_DISCORD_IDS.length,
          staffIdsCount: envConfig.STAFF_DISCORD_IDS.length,
          chefIdsCount: envConfig.CHEF_DISCORD_IDS.length,
          chefRoleConfigured: !!envConfig.CHEF_FAMILLE_ROLE_ID,
          etatMajorRoleConfigured: !!envConfig.ETAT_MAJOR_ROLE_ID,
          recruiterRoleConfigured: !!envConfig.RECRUTEUR_ROLE_ID,
          staffFullRoleIds: envConfig.DISCORD_STAFF_FULL_ROLE_IDS,
          recruiterRoleIds: envConfig.DISCORD_RECRUITER_ROLE_IDS,
        },

        // Diagnosis
        diagnosis: {
          isAuthenticated: !!session,
          hasDiscordLinked: !!discordId,
          hasStaffInDB: !!staffUser,
          hasMemberInDB: !!member,
          canAccessViaLegacy: hasAdminAccess || hasStaffAllowlist || staffFull,
          canAccessViaRBAC: !!staffUser,
          recommendedAction: !staffUser && discordId ? "CREATE_STAFF_USER_IN_DB" : 
                            staffUser && staffUser.permissions.length === 0 ? "ASSIGN_PERMISSIONS" :
                            "OK",
        },
      },
    });
  } catch (error) {
    console.error("[/api/me/roles] Error:", error);
    return NextResponse.json({
      ok: false,
      error: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : String(error),
    }, { status: 500 });
  }
}
