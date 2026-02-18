/**
 * RBAC - Role-Based Access Control
 * Centralized permission checking for the panel
 */

import { prisma } from "@/lib/db";
import { getSession } from "@/auth";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type PermissionCode =
  | "TICKETS_VIEW"
  | "TICKETS_CLOSE"
  | "TICKETS_ASSIGN"
  | "SANCTIONS_VIEW"
  | "SANCTIONS_CREATE"
  | "SANCTIONS_CLOSE"
  | "MEETINGS_VIEW"
  | "MEETINGS_EDIT"
  | "MEETINGS_FINALIZE"
  | "MEMBERS_VIEW"
  | "MEMBERS_EDIT"
  | "MEMBERS_IMPORT"
  | "LINK_MANAGE"
  | "ACTIVITY_VIEW"
  | "ACTIVITY_MANAGE"
  | "ABSENCES_VIEW"
  | "ABSENCES_MANAGE"
  | "STATS_VIEW"
  | "DISCORD_CONFIG"
  | "DISCORD_SYNC"
  | "AUDIT_VIEW"
  | "ADMIN_FULL";

export type StaffUserInfo = {
  id: string;
  familyId: string;
  userId: string | null;
  discordId: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  rolePriority: number;
  isActive: boolean;
  permissions: string[];
};

export type GuardResult = { session: any; staffUser: StaffUserInfo } | Response;

// ─────────────────────────────────────────────────────────────
// Session Helpers
// ─────────────────────────────────────────────────────────────

function extractDiscordId(session: any): string | null {
  // Try multiple paths to find Discord ID
  const paths = [
    session?.discordId,
    session?.user?.discordId,
    session?.account?.providerAccountId,
  ];

  for (const path of paths) {
    if (typeof path === "string" && path.trim()) {
      return path.trim();
    }
  }

  return null;
}

function extractUserId(session: any): string | null {
  return session?.user?.id ?? session?.userId ?? null;
}

function isCuid(value?: string | null): boolean {
  return typeof value === "string" && /^c[a-z0-9]{24}$/i.test(value);
}

// ─────────────────────────────────────────────────────────────
// Core RBAC Functions
// ─────────────────────────────────────────────────────────────

/**
 * Get staff user info from session
 */
export async function getStaffUser(
  session: any,
  familyId: string = DEFAULT_FAMILY_ID
): Promise<StaffUserInfo | null> {
  const discordId = extractDiscordId(session);
  const userId = extractUserId(session);

  const resolvedFamilyId = isCuid(familyId)
    ? familyId
    : await resolveFamilyId(familyId);

  // ✅ RBAC Debug Logging
  const debugContext = {
    hasSession: !!session,
    discordId: discordId ?? null,
    userId: userId ?? null,
    familyId,
  };

  if (!discordId && !userId) {
    console.info('[RBAC] getStaffUser: No identifiers', debugContext);
    return null;
  }

  // Find staff user by Discord ID or user ID
  const staffUser = await prisma.staffUser.findFirst({
    where: {
      familyId: resolvedFamilyId,
      isActive: true,
      OR: [
        ...(discordId ? [{ discordId }] : []),
        ...(userId ? [{ userId }] : []),
      ],
    },
    include: {
      role: {
        include: {
          permissions: {
            include: { permission: true },
          },
        },
      },
    },
  });

  if (!staffUser || !staffUser.role.isActive) {
    console.info('[RBAC] getStaffUser: Not found or inactive', {
      ...debugContext,
      staffUserFound: !!staffUser,
      roleActive: staffUser?.role?.isActive ?? false,
    });
    if (!discordId) return null;

    try {
      const { getDiscordRolesForUser, isStaffFull } = await import("@/lib/discord-roles");
      const roles = await getDiscordRolesForUser(discordId);

      if (!isStaffFull(roles)) {
        return null;
      }

      const mappedRole = await prisma.staffRole.findFirst({
        where: {
          familyId: resolvedFamilyId,
          isActive: true,
          discordRoleId: { in: roles },
        },
        orderBy: { priority: "desc" },
      });

      const fallbackRole = mappedRole || await prisma.staffRole.findFirst({
        where: { familyId: resolvedFamilyId, isActive: true },
        orderBy: { priority: "desc" },
      });

      if (!fallbackRole) {
        return null;
      }

      const upserted = await prisma.staffUser.upsert({
        where: {
          familyId_discordId: {
            familyId: resolvedFamilyId,
            discordId,
          },
        },
        update: {
          roleId: fallbackRole.id,
          userId: userId ?? null,
          isActive: true,
        },
        create: {
          familyId: resolvedFamilyId,
          discordId,
          userId: userId ?? null,
          roleId: fallbackRole.id,
          isActive: true,
        },
        include: {
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      });

      console.info("[RBAC] staffUser upserted", {
        discordId,
        roleCode: upserted.role.code,
        familyId: resolvedFamilyId,
      });

      const permissions = upserted.role.permissions.map((rp) => rp.permission.code);
      const allPermissions = permissions.includes("ADMIN_FULL")
        ? await getAllPermissionCodes()
        : permissions;

      return {
        id: upserted.id,
        familyId: upserted.familyId,
        userId: upserted.userId,
        discordId: upserted.discordId,
        roleId: upserted.roleId,
        roleCode: upserted.role.code,
        roleName: upserted.role.name,
        rolePriority: upserted.role.priority,
        isActive: upserted.isActive,
        permissions: allPermissions,
      };
    } catch (error) {
      console.error("[RBAC] staffUser upsert failed", { discordId, error });
      return null;
    }
  }

  // Build permissions list
  const permissions = staffUser.role.permissions.map((rp) => rp.permission.code);

  console.info('[RBAC] getStaffUser: Success', {
    ...debugContext,
    roleCode: staffUser.role.code,
    roleName: staffUser.role.name,
    permissionsCount: permissions.length,
  });

  // ADMIN_FULL grants all permissions
  const allPermissions = permissions.includes("ADMIN_FULL")
    ? await getAllPermissionCodes()
    : permissions;

  return {
    id: staffUser.id,
    familyId: staffUser.familyId,
    userId: staffUser.userId,
    discordId: staffUser.discordId,
    roleId: staffUser.roleId,
    roleCode: staffUser.role.code,
    roleName: staffUser.role.name,
    rolePriority: staffUser.role.priority,
    isActive: staffUser.isActive,
    permissions: allPermissions,
  };
}

/**
 * Get all permission codes (for ADMIN_FULL)
 */
async function getAllPermissionCodes(): Promise<string[]> {
  const permissions = await prisma.staffPermission.findMany({
    select: { code: true },
  });
  return permissions.map((p) => p.code);
}

/**
 * ✅ UNIFIED ACCESS CHECK
 * Check if user can access staff panel using ALL methods:
 * 1. DB RBAC (StaffUser record)
 * 2. Discord roles (isStaffFull check)
 * 3. Legacy session flags (isStaff)
 * 
 * Returns: { canAccess: boolean, source: string, staffUser: StaffUserInfo | null }
 */
export async function canAccessStaffPanel(
  session: any,
  familyId: string = DEFAULT_FAMILY_ID
): Promise<{ canAccess: boolean; source: "DB_RBAC" | "DISCORD_ROLES" | "LEGACY_SESSION" | "NONE"; staffUser: StaffUserInfo | null }> {
  if (!session) {
    return { canAccess: false, source: "NONE", staffUser: null };
  }

  // 1. Try DB RBAC first (primary method)
  try {
    const staffUser = await getStaffUser(session, familyId);
    if (staffUser) {
      return { canAccess: true, source: "DB_RBAC", staffUser };
    }
  } catch (error) {
    console.error("[RBAC] canAccessStaffPanel: DB check failed", error);
  }

  // 2. Try Discord roles (requires Discord API)
  const discordId = extractDiscordId(session);
  if (discordId) {
    try {
      // Import Discord roles check
      const { getDiscordRolesForUser, isStaffFull } = await import("@/lib/discord-roles");
      const roles = await getDiscordRolesForUser(discordId);
      if (isStaffFull(roles)) {
        return {
          canAccess: true,
          source: "DISCORD_ROLES",
          staffUser: {
            id: "discord-only",
            familyId,
            userId: null,
            discordId,
            roleId: "discord-only",
            roleCode: "DISCORD_STAFF",
            roleName: "Discord Staff",
            rolePriority: 0,
            isActive: true,
            permissions: [],
          },
        };
      }
    } catch (error) {
      console.error("[RBAC] canAccessStaffPanel: Discord check failed", error);
    }
  }

  // 3. Fallback: Legacy session flags
  const legacyIsStaff = Boolean((session as any)?.isStaff);
  if (legacyIsStaff) {
    return { canAccess: true, source: "LEGACY_SESSION", staffUser: null };
  }

  // No access
  return { canAccess: false, source: "NONE", staffUser: null };
}

/**
 * Check if staff user has a specific permission
 */
export function hasPermission(staffUser: StaffUserInfo | null, permission: PermissionCode): boolean {
  if (!staffUser) return false;
  return staffUser.permissions.includes(permission);
}

/**
 * Check if staff user has any of the specified permissions
 */
export function hasAnyPermission(
  staffUser: StaffUserInfo | null,
  permissions: PermissionCode[]
): boolean {
  if (!staffUser) return false;
  return permissions.some((p) => staffUser.permissions.includes(p));
}

/**
 * Check if staff user has all of the specified permissions
 */
export function hasAllPermissions(
  staffUser: StaffUserInfo | null,
  permissions: PermissionCode[]
): boolean {
  if (!staffUser) return false;
  return permissions.every((p) => staffUser.permissions.includes(p));
}

// ─────────────────────────────────────────────────────────────
// Guard Functions (for API routes)
// ─────────────────────────────────────────────────────────────

/**
 * Require authentication (any logged-in user)
 */
export async function requireAuth(): Promise<GuardResult> {
  const session = await getSession();
  const userId = extractUserId(session);

  if (!userId) {
    return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Get staff user (may be null if not staff)
  const staffUser = await getStaffUser(session);

  // Return session with null staffUser for non-staff
  return { session, staffUser: staffUser as any };
}

/**
 * Require staff role (any active staff user)
 */
export async function requireStaff(familyId?: string): Promise<GuardResult> {
  const session = await getSession();
  
  console.info('[RBAC] requireStaff: Checking access', {
    hasSession: !!session,
    sessionUser: session?.user?.email ?? 'unknown',
    familyId: familyId ?? DEFAULT_FAMILY_ID,
  });

  const staffUser = await getStaffUser(session, familyId);

  if (!staffUser) {
    // Fallback: check legacy isStaff flag
    const user = session?.user as any;
    console.info('[RBAC] requireStaff: No staffUser, checking legacy', {
      legacyIsStaff: user?.isStaff ?? false,
    });
    
    if (user?.isStaff) {
      // Legacy staff - create minimal staff info
      const discordId = extractDiscordId(session);
      return {
        session,
        staffUser: {
          id: "legacy",
          familyId: familyId ?? DEFAULT_FAMILY_ID,
          userId: user.id,
          discordId: discordId ?? "",
          roleId: "legacy",
          roleCode: "LEGACY_STAFF",
          roleName: "Legacy Staff",
          rolePriority: 50,
          isActive: true,
          permissions: [
            "TICKETS_VIEW", "TICKETS_CLOSE",
            "SANCTIONS_VIEW",
            "MEETINGS_VIEW",
            "MEMBERS_VIEW",
            "ACTIVITY_VIEW",
            "ABSENCES_VIEW",
          ],
        },
      };
    }

    return new Response(JSON.stringify({ ok: false, error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return { session, staffUser };
}

/**
 * Require a specific permission
 */
export async function requirePermission(
  permission: PermissionCode,
  familyId?: string
): Promise<GuardResult> {
  const guard = await requireStaff(familyId);
  if (guard instanceof Response) return guard;

  if (!hasPermission(guard.staffUser, permission)) {
    console.warn(
      `[RBAC] Permission denied: ${permission} for user ${guard.staffUser.discordId} (role: ${guard.staffUser.roleCode})`
    );
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Forbidden",
        requiredPermission: permission,
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  return guard;
}

/**
 * Require staff panel access (for stats, link, dashboard)
 * ✅ LESS RESTRICTIVE: Allows any user with canAccessStaffPanel=true
 * (doesn't require a specific permission like STATS_VIEW or LINK_MANAGE)
 * 
 * Used by: /staff/stats, /staff/link, /staff/dashboard
 */
export async function requireStaffAccess(familyId?: string): Promise<GuardResult> {
  const session = await getSession();
  const discordId = extractDiscordId(session);
  const family = familyId ?? DEFAULT_FAMILY_ID;

  const access = await canAccessStaffPanel(session, family);

  if (!access.canAccess) {
    console.warn(
      `[RBAC] Staff access denied: ${discordId ?? "unknown"}`,
      {
        source: access.source,
        timestamp: new Date().toISOString(),
      }
    );

    return new Response(
      JSON.stringify({
        ok: false,
        error: "Forbidden",
        reason: "Staff panel access required",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  // Get staff user info if available (may be null for Discord-only users)
  let staffUser = access.staffUser;
  if (!staffUser && discordId) {
    try {
      staffUser = await getStaffUser(session, family);
    } catch (error) {
      console.debug("[RBAC] requireStaffAccess: Failed to get staff user from DB", { discordId, error });
    }
  }

  console.info(
    `[RBAC] Staff access granted: ${discordId}`,
    {
      source: access.source,
      roleCode: staffUser?.roleCode ?? "none",
    }
  );

  return {
    session,
    staffUser: staffUser ?? ({
      id: "discord-only",
      familyId: family,
      userId: null,
      discordId: discordId ?? "",
      roleId: "discord-only",
      roleCode: "DISCORD_STAFF",
      roleName: "Discord Staff",
      rolePriority: 0,
      isActive: true,
      permissions: [],
    } as any),
  };
}

/**
 * Require any of the specified permissions
 */
export async function requireAnyPermission(
  permissions: PermissionCode[],
  familyId?: string
): Promise<GuardResult> {
  const guard = await requireStaff(familyId);
  if (guard instanceof Response) return guard;

  if (!hasAnyPermission(guard.staffUser, permissions)) {
    console.warn(
      `[RBAC] Permission denied: any of [${permissions.join(", ")}] for user ${guard.staffUser.discordId}`
    );
    return new Response(
      JSON.stringify({
        ok: false,
        error: "Forbidden",
        requiredPermissions: permissions,
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }

  return guard;
}

// ─────────────────────────────────────────────────────────────
// Discord Role Mapping
// ─────────────────────────────────────────────────────────────

/**
 * Sync user's panel role based on their Discord roles
 */
export async function syncDiscordRoleToPanel(
  discordId: string,
  discordRoleIds: string[],
  familyId: string = DEFAULT_FAMILY_ID
): Promise<StaffUserInfo | null> {
  // Get all staff roles with Discord role mapping, ordered by priority
  const staffRoles = await prisma.staffRole.findMany({
    where: {
      familyId,
      isActive: true,
      discordRoleId: { not: null },
    },
    orderBy: { priority: "desc" },
  });

  // Find highest priority matching role
  const matchedRole = staffRoles.find(
    (role) => role.discordRoleId && discordRoleIds.includes(role.discordRoleId)
  );

  if (!matchedRole) {
    // No matching role - remove staff user if exists
    await prisma.staffUser.deleteMany({
      where: { familyId, discordId },
    });
    return null;
  }

  // Upsert staff user with matched role
  const staffUser = await prisma.staffUser.upsert({
    where: { familyId_discordId: { familyId, discordId } },
    update: { roleId: matchedRole.id, isActive: true },
    create: {
      familyId,
      discordId,
      roleId: matchedRole.id,
      isActive: true,
    },
    include: {
      role: {
        include: {
          permissions: { include: { permission: true } },
        },
      },
    },
  });

  const permissions = staffUser.role.permissions.map((rp) => rp.permission.code);
  const allPermissions = permissions.includes("ADMIN_FULL")
    ? await getAllPermissionCodes()
    : permissions;

  return {
    id: staffUser.id,
    familyId: staffUser.familyId,
    userId: staffUser.userId,
    discordId: staffUser.discordId,
    roleId: staffUser.roleId,
    roleCode: staffUser.role.code,
    roleName: staffUser.role.name,
    rolePriority: staffUser.role.priority,
    isActive: staffUser.isActive,
    permissions: allPermissions,
  };
}

/**
 * Link a NextAuth user to their staff user
 */
export async function linkUserToStaffUser(
  userId: string,
  discordId: string,
  familyId: string = DEFAULT_FAMILY_ID
): Promise<void> {
  await prisma.staffUser.updateMany({
    where: { familyId, discordId },
    data: { userId },
  });
}

// ─────────────────────────────────────────────────────────────
// API Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Get user permissions for frontend
 */
export async function getUserPermissions(
  session: any,
  familyId?: string
): Promise<string[]> {
  const staffUser = await getStaffUser(session, familyId);
  return staffUser?.permissions ?? [];
}

/**
 * Get all roles for a family
 */
export async function getRoles(familyId: string = DEFAULT_FAMILY_ID) {
  return prisma.staffRole.findMany({
    where: { familyId, isActive: true },
    orderBy: { priority: "desc" },
    include: {
      permissions: {
        include: { permission: true },
      },
      _count: { select: { staffUsers: true } },
    },
  });
}

/**
 * Get all permissions
 */
export async function getPermissions() {
  return prisma.staffPermission.findMany({
    orderBy: [{ category: "asc" }, { code: "asc" }],
  });
}
