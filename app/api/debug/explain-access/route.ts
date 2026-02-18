import { NextResponse } from "next/server";
import { getSession } from "@/auth";
import { getStaffUser } from "@/lib/rbac";
import { getUserDiscordIdFromSession } from "@/server/auth/discord";
import { getDiscordRolesForUser, isStaffFull, isRecruiter } from "@/lib/discord-roles";
import { getStaffRoleIds } from "@/lib/discord-rbac";

/**
 * GET /api/debug/explain-access
 * 
 * Explique pourquoi un user peut ou ne peut pas accéder au panel staff
 * Montre TOUTE la chaîne de décision RBAC avec détails
 * 
 * Retourne:
 * - session: authentification de base
 * - identifiers: comment on identifie le user (userId, discordId)
 * - discordRoles: rôles Discord live
 * - staffUser: record DB StaffUser (null si pas trouvé)
 * - legacyFlags: flags de la session (isStaff, isChef)
 * - decision: décision finale avec raison + source d'accès
 */
export async function GET() {
  try {
    const session = await getSession();
    
    if (!session) {
      return NextResponse.json({
        ok: false,
        error: "NOT_AUTHENTICATED",
        decision: {
          canAccess: false,
          reason: "No active session - user not logged in",
          deniedAt: "session_check",
        },
      }, { status: 401 });
    }

    // 1. Extract identifiers
    const userId = (session as any)?.userId ?? (session as any)?.user?.id ?? null;
    const sessionDiscordId = (session as any)?.discordId ?? (session as any)?.user?.discordId ?? null;
    
    // Get Discord ID from Account table (authoritative source)
    const discordIdFromAccount = await getUserDiscordIdFromSession(session);
    
    const identifiers = {
      userId,
      sessionDiscordId,
      discordIdFromAccount,
      usingDiscordId: discordIdFromAccount ?? sessionDiscordId,
    };

    // 2. Get Discord roles (live from API)
    let discordRoles: string[] = [];
    let discordRolesError: string | null = null;
    if (identifiers.usingDiscordId) {
      try {
        discordRoles = await getDiscordRolesForUser(identifiers.usingDiscordId);
      } catch (error) {
        discordRolesError = error instanceof Error ? error.message : String(error);
      }
    }

    const staffRoleIds = getStaffRoleIds();
    const hasStaffDiscordRole = discordRoles.some(r => staffRoleIds.includes(r));
    const staffFullCheck = isStaffFull(discordRoles);
    const recruiterCheck = isRecruiter(discordRoles);

    const discordRolesInfo = {
      roles: discordRoles,
      rolesCount: discordRoles.length,
      error: discordRolesError,
      staffRoleIds,
      hasStaffRole: hasStaffDiscordRole,
      isStaffFull: staffFullCheck,
      isRecruiter: recruiterCheck,
    };

    // 3. Get StaffUser from DB (RBAC)
    let staffUser: any = null;
    let staffUserError: string | null = null;
    try {
      const su = await getStaffUser(session);
      if (su) {
        staffUser = {
          id: su.id,
          discordId: su.discordId,
          roleCode: su.roleCode,
          roleName: su.roleName,
          rolePriority: su.rolePriority,
          permissions: su.permissions,
          permissionsCount: su.permissions.length,
          isActive: su.isActive,
        };
      }
    } catch (error) {
      staffUserError = error instanceof Error ? error.message : String(error);
    }

    const staffUserInfo = {
      found: !!staffUser,
      data: staffUser,
      error: staffUserError,
    };

    // 4. Legacy flags from session
    const legacyFlags = {
      isStaff: (session as any)?.isStaff ?? false,
      isChef: (session as any)?.isChef ?? false,
      roles: (session as any)?.roles ?? [],
      permissions: (session as any)?.permissions ?? [],
    };

    // 5. Make the access decision
    let canAccess = false;
    let reason = "";
    let accessSource: "DB_RBAC" | "LEGACY_SESSION" | "DISCORD_ROLES" | "NONE" = "NONE";
    let deniedAt: string | null = null;

    if (!identifiers.usingDiscordId) {
      canAccess = false;
      reason = "No Discord ID found in session or Account table";
      deniedAt = "identifier_extraction";
    } else if (staffUser) {
      // Primary: DB RBAC
      canAccess = true;
      reason = `StaffUser found in DB with role ${staffUser.roleCode} (${staffUser.permissionsCount} permissions)`;
      accessSource = "DB_RBAC";
    } else if (staffFullCheck) {
      // Fallback: Discord roles
      canAccess = true;
      reason = `Has staff Discord role (isStaffFull=true) - ${discordRoles.length} total roles`;
      accessSource = "DISCORD_ROLES";
    } else if (legacyFlags.isStaff) {
      // Fallback: Legacy session flag
      canAccess = true;
      reason = "Session has legacy isStaff flag set to true";
      accessSource = "LEGACY_SESSION";
    } else {
      // Denied
      canAccess = false;
      reason = "No StaffUser DB record, no staff Discord role, no legacy session flag";
      deniedAt = "all_checks_failed";
    }

    const decision = {
      canAccess,
      reason,
      accessSource,
      deniedAt,
      checkOrder: [
        { check: "session", passed: true },
        { check: "discordId", passed: !!identifiers.usingDiscordId },
        { check: "staffUser_DB", passed: !!staffUser },
        { check: "staffFull_Discord", passed: staffFullCheck },
        { check: "isStaff_Legacy", passed: legacyFlags.isStaff },
      ],
    };

    // 6. Recommendations if denied
    const recommendations: string[] = [];
    if (!canAccess) {
      if (!identifiers.usingDiscordId) {
        recommendations.push("User needs to link their Discord account to their panel account");
      } else {
        if (!staffUser && !staffUserError) {
          recommendations.push(`Create a StaffUser record for discordId=${identifiers.usingDiscordId} in the database`);
          recommendations.push("Or grant them a staff role in Discord server");
        }
        if (staffUserError) {
          recommendations.push(`Fix StaffUser DB query error: ${staffUserError}`);
        }
        if (discordRolesError) {
          recommendations.push(`Fix Discord API error: ${discordRolesError}`);
        }
        if (!hasStaffDiscordRole && !discordRolesError) {
          recommendations.push(`User has ${discordRoles.length} Discord roles but none match staff role IDs: ${staffRoleIds.join(", ")}`);
          recommendations.push("Check DISCORD_STAFF_FULL_ROLE_IDS environment variable");
        }
      }
    }

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      identifiers,
      discordRoles: discordRolesInfo,
      staffUser: staffUserInfo,
      legacyFlags,
      decision,
      recommendations,
    });
  } catch (error: any) {
    console.error("[/api/debug/explain-access] Error:", error);
    return NextResponse.json({
      ok: false,
      error: "Failed to explain access",
      details: error.message || String(error),
    }, { status: 500 });
  }
}
