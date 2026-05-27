import { getSession } from "@/auth";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";
import { getUserDiscordIdFromSession } from "@/server/auth/discord";
import { createAuditLog } from "@/lib/audit";
import { debug } from "@/lib/logger";
import { headers } from "next/headers";
import {
  CHEF_FAMILLE_ROLE_ID,
  SOUS_CHEF_FAMILLE_ROLE_ID,
  ETAT_MAJOR_ROLE_ID,
  RECRUTEUR_ROLE_ID,
  hasAnyRole,
  logDiscordRoleConfig,
  getRecruiterRoleIds,
  getStaffFullRoleIds,
  isRecruiter,
  isStaffFull,
  getDiscordRolesForUser,
  type DiscordRoleResult,
} from "@/lib/discord-roles";
import { getStaffRoleIds } from "@/lib/discord-rbac";

type GuardOk = {
  session: any;
};

type GuardResult = GuardOk | Response;

// Grade levels
export const GRADE_LEVELS = {
  MEMBER: 0,
  STAFF: 10,
  CHEF: 20,
} as const;

// Request-scoped role cache to prevent multiple API calls per request
const requestRoleCache = new Map<string, { roles: string[]; timestamp: number }>();
const REQUEST_CACHE_TTL_MS = 5_000; // Very short TTL, just for single request lifecycle

/**
 * Helper: Retourne une réponse d'erreur JSON
 * Format: { ok: false, error: "message" }
 */
function jsonError(status: number, error: string, message?: string): Response {
  return new Response(JSON.stringify({ ok: false, error, message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function discordUnavailableResponse(): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error: "DISCORD_API_UNAVAILABLE",
      message: "Discord API indisponible, réessayez.",
    }),
    {
      status: 503,
      headers: {
        "content-type": "application/json",
        Location: "/staff/forbidden?reason=discord",
      },
    }
  );
}

const AUDIT_TTL_MS = 60_000;
const auditCache = new Map<string, number>();

function shouldAudit(key: string, ttlMs = AUDIT_TTL_MS): boolean {
  const now = Date.now();
  const last = auditCache.get(key) ?? 0;
  if (now - last < ttlMs) return false;
  auditCache.set(key, now);
  return true;
}

async function getRequestPath(): Promise<string> {
  try {
    const h = await headers();
    return (
      h.get("x-original-url") ||
      h.get("x-rewrite-url") ||
      h.get("x-forwarded-uri") ||
      h.get("x-forwarded-path") ||
      h.get("x-url") ||
      h.get("referer") ||
      "unknown"
    );
  } catch {
    return "unknown";
  }
}


async function getRolesForSession(session: any): Promise<DiscordRoleResult> {
  const discordId = await getUserDiscordIdFromSession(session);
  if (!discordId) return { roles: [] };

  const debugDiscord = process.env.DEBUG_DISCORD === "1";
  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  
  // Check request-scoped cache first
  const now = Date.now();
  const cached = requestRoleCache.get(discordId);
  if (cached && (now - cached.timestamp) < REQUEST_CACHE_TTL_MS) {
    debug("[guards] request_cache_hit", { discordId });
    return { roles: cached.roles };
  }

  // DB-only: read Discord roles mirror (no live Discord API calls)
  const member = await prisma.member.findUnique({
    where: { familyId_discordId: { familyId: familyDbId, discordId } },
    select: {
      discordInGuild: true,
      discordRoleIds: true,
      discordRolesUpdatedAt: true,
      discordLastError: true,
    },
  });

  if (debugDiscord) {
    console.log("[guards] DB-only roles", {
      discordId: discordId.substring(0, 6) + "...",
      hasMember: Boolean(member),
      inGuild: member?.discordInGuild ?? null,
      rolesCount: member?.discordRoleIds?.length ?? 0,
      lastError: member?.discordLastError ?? null,
      updatedAt: member?.discordRolesUpdatedAt ?? null,
    });
  }

  if (!member) {
    return { roles: [], error: "UNAVAILABLE" };
  }

  const roles = Array.isArray(member.discordRoleIds) ? member.discordRoleIds : [];

  // ✅ Si discordLastError est présent mais que des rôles sont en cache, on utilise le cache.
  // Cela rend le guard cohérent avec canAccessStaffPanel (phase 2 rbac.ts) qui ignore discordLastError.
  // On retourne UNAVAILABLE uniquement si les rôles sont vides ET qu'une erreur est présente.
  if (member.discordLastError && roles.length === 0) {
    return { roles: [], error: "UNAVAILABLE" };
  }

  if (member.discordInGuild === null || member.discordInGuild === undefined) {
    return { roles: [], error: "UNAVAILABLE" };
  }
  const result: DiscordRoleResult = {
    roles,
  };

  // Store in request cache
  requestRoleCache.set(discordId, { roles, timestamp: now });
  
  // Clean up old entries (simple cleanup every 10th call)
  if (Math.random() < 0.1) {
    for (const [key, value] of requestRoleCache.entries()) {
      if (now - value.timestamp > REQUEST_CACHE_TTL_MS) {
        requestRoleCache.delete(key);
      }
    }
  }
  
  return result;
}

export async function requireLosEsperados(): Promise<GuardResult> {
  const session = await getSession();
  const userId = (session as any)?.userId ?? (session as any)?.user?.id;

  if (!userId) return jsonError(401, "Unauthorized");
  return { session };
}

/**
 * ✅ Require authenticated session (redirect to /login)
 */
export async function requireAuth(): Promise<GuardResult> {
  const session = await getSession();
  if (!session) {
    return new Response(null, {
      status: 307,
      headers: { Location: "/login" },
    });
  }

  return { session };
}

export async function requirePrivileged(): Promise<GuardResult> {
  const session = await getSession();
  if (!session) return jsonError(401, "Unauthorized");

  const discordId = await getUserDiscordIdFromSession(session);
  if (!discordId) return jsonError(403, "Missing discordId");

  const ownerDiscordId = process.env.OWNER_DISCORD_ID ?? "";
  const isOwner = ownerDiscordId && discordId === ownerDiscordId;

  const rolesResult = await getRolesForSession(session);
  if (rolesResult.error === "UNAVAILABLE") {
    return discordUnavailableResponse();
  }
  const staffRoleIds = getStaffRoleIds();
  const hasStaffRole = hasAnyRole(rolesResult.roles, staffRoleIds);

  if (!isOwner && !hasStaffRole) {
    const path = await getRequestPath();
    const denyKey = `ACCESS_DENIED:${discordId}:${path}`;
    if (shouldAudit(denyKey)) {
      void createAuditLog({
        actorType: "member",
        actorId: discordId,
        actorMemberId: null,
        action: "ACCESS_DENIED",
        entity: "Auth",
        entityId: discordId,
        entityName: "staff",
        meta: { reason: "not_owner_nor_staff", path },
      });
    }

    return jsonError(403, "UNAUTHORIZED");
  }

  const path = await getRequestPath();
  const allowKey = `ACCESS_ALLOWED:staff:${discordId}:${path}`;
  if (shouldAudit(allowKey)) {
    void createAuditLog({
      actorType: "member",
      actorId: discordId,
      actorMemberId: null,
      action: "ACCESS_ALLOWED",
      entity: "Auth",
      entityId: discordId,
      entityName: "staff",
      meta: { reason: isOwner ? "owner" : "role", path },
    });
  }

  return {
    session: {
      ...session,
      discordId,
      _auth: { isOwner, hasChefRole: hasStaffRole },
    },
  };
}

export async function requireAdmin(): Promise<GuardResult> {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const s: any = guard.session;
  const u: any = guard.session.user ?? {};
  const adminIds = (process.env.ADMIN_DISCORD_IDS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  const discordId = s?.discordId ?? u?.discordId;

  const isAdmin =
    Boolean(u?.isAdmin ?? s?.isAdmin) ||
    (discordId ? adminIds.includes(String(discordId)) : false);

  if (!isAdmin) return jsonError(403, "Forbidden");
  return guard;
}

export async function requireChef(): Promise<GuardResult> {
  logDiscordRoleConfig("requireChef");
  const session = await getSession();
  if (!session) return jsonError(401, "Unauthorized");

  const rolesResult = await getRolesForSession(session);
  if (rolesResult.error === "UNAVAILABLE") {
    return discordUnavailableResponse();
  }
  const hasAccess = hasAnyRole(rolesResult.roles, [CHEF_FAMILLE_ROLE_ID, SOUS_CHEF_FAMILLE_ROLE_ID, ETAT_MAJOR_ROLE_ID]);

  if (!hasAccess) return jsonError(403, "Forbidden");
  return { session };
}

/**
 * ✅ PATCH: Require specific role from Member
 * Checks: session + isStaff + Member.grade matches role
 * Usage: await requireRole("CHEF") or await requireRole("COCHEF")
 */
export async function requireRole(
  role: "CHEF" | "COCHEF" | "STAFF"
): Promise<GuardResult> {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const member = (guard.session as any)?.member;
  if (!member?.grade) return jsonError(403, "Member grade not found");

  const memberGrade = String(member.grade).toUpperCase();

  // CHEF can access everything
  if (memberGrade === "CHEF") return guard;

  // COCHEF can access COCHEF and STAFF
  if (role === "COCHEF" && memberGrade === "COCHEF") return guard;

  // STAFF can only access STAFF
  if (role === "STAFF") return guard;

  return jsonError(403, `Role ${role} required`);
}

/**
 * ✅ Guard staff (RBAC)
 * Logique:
 *   1. Vérifie session existe
 *   2. Vérifie rôle staff actif via RBAC (staffUser)
 *   3. NE dépend PAS d'un member lié
 * Utilisé par /staff/* (sauf /staff/link et /staff/debug/auth)
 */
/**
 * ⚠️ DEPRECATED: Use requireStaffFull() instead
 * Kept for backward compatibility
 */
export const requireChefOrEtatMajor = requireStaffFull;

/**
 * ✅ Guard: Require STAFF_FULL role (complete staff panel access)
 * 
 * Allowed:
 * - User is OWNER_DISCORD_ID
 * - User is in ADMIN_DISCORD_IDS
 * - User has any of: CHEF_FAMILLE_ROLE_ID, ETAT_MAJOR_ROLE_ID, HAUT_GRADE_ROLE_ID, JEFE_DE_JEFES_ROLE_ID, EL_PADRINO_ROLE_ID
 * - User has any DISCORD_STAFF_FULL_ROLE_IDS role
 * 
 * Denied: Redirect to /staff/forbidden
 */
export async function requireStaffFull(): Promise<GuardResult> {
  logDiscordRoleConfig("requireStaffFull");
  if (process.env.THEME_DEBUG_BYPASS === "1" && process.env.NODE_ENV !== "production") {
    return { session: null };
  }
  const session = await getSession();
  if (!session) {
    return new Response(null, {
      status: 307,
      headers: { Location: "/login" },
    });
  }

  const discordId = await getUserDiscordIdFromSession(session);
  if (!discordId) {
    debug("[staffGuard] no Discord ID found");
    return jsonError(403, "Missing discordId");
  }

  // Check owner override
  const ownerDiscordId = process.env.OWNER_DISCORD_ID ?? "";
  if (ownerDiscordId && discordId === ownerDiscordId) {
    debug("[staffGuard]", { discordId, roleActive: true, reason: "owner" });
    return { session };
  }

  // Check admin allowlist
  const adminIds = (process.env.ADMIN_DISCORD_IDS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (adminIds.includes(discordId)) {
    debug("[staffGuard]", { discordId, roleActive: true, reason: "admin" });
    return { session };
  }

  // Check staff full roles from Discord
  const rolesResult = await getRolesForSession(session);
  if (rolesResult.error === "UNAVAILABLE") {
    return discordUnavailableResponse();
  }

  const userRoles = rolesResult.roles ?? [];
  
  // Build list of full-staff role IDs: CHEF_FAMILLE + SOUS_CHEF_FAMILLE + ETAT_MAJOR + HAUT_GRADE + JEFE_DE_JEFES + EL_PADRINO + ENCADRANT + DISCORD_STAFF_FULL_ROLE_IDS
  //
  // Encadrant inclus car il a accès en VISIBILITÉ à toutes les pages staff.
  // Les actions sensibles (sanction, plainte, finalize meeting, grade) sont
  // gardées séparément par requireFullWriter() — pas ici.
  const fullStaffRoleIds = [
    CHEF_FAMILLE_ROLE_ID,
    SOUS_CHEF_FAMILLE_ROLE_ID,
    ETAT_MAJOR_ROLE_ID,
    process.env.HAUT_GRADE_ROLE_ID ?? "",
    process.env.JEFE_DE_JEFES_ROLE_ID ?? "",
    process.env.EL_PADRINO_ROLE_ID ?? "",
    process.env.ENCADRANT_ROLE_ID ?? "1497293700831903774",
    ...getStaffFullRoleIds(),
  ].filter(Boolean);
  
  const hasStaffFullRole = hasAnyRole(userRoles, fullStaffRoleIds);

  if (!hasStaffFullRole) {
    debug("[staffGuard]", { discordId, roleActive: false, reason: "no_staff_role" });

    const path = await getRequestPath();
    const denyKey = `STAFF_FULL_DENIED:${discordId}:${path}`;
    if (shouldAudit(denyKey)) {
      void createAuditLog({
        actorType: "member",
        actorId: discordId,
        action: "STAFF_FULL_DENIED",
        entity: "Auth",
        entityId: discordId,
        entityName: "staff",
        meta: { reason: "missing_staff_full_role", path },
      });
    }

    return new Response(null, {
      status: 307,
      headers: { Location: "/staff/forbidden" },
    });
  }

  debug("[staffGuard]", { discordId, roleActive: true, reason: "has_staff_role" });
  return { session };
}

/**
 * ✅ Guard: Require RECRUITER OR STAFF_FULL role
 * 
 * Allowed:
 * - All requireStaffFull() conditions
 * - User has any DISCORD_RECRUITER_ROLE_IDS role
 * 
 * Denied: Redirect to /staff/forbidden
 */
export async function requireRecruiterOrAbove(): Promise<GuardResult> {
  logDiscordRoleConfig("requireRecruiterOrAbove");
  const session = await getSession();
  if (!session) {
    return new Response(null, {
      status: 307,
      headers: { Location: "/login" },
    });
  }

  const discordId = await getUserDiscordIdFromSession(session);
  if (!discordId) {
    return jsonError(403, "Missing discordId");
  }

  // Check owner override
  const ownerDiscordId = process.env.OWNER_DISCORD_ID ?? "";
  if (ownerDiscordId && discordId === ownerDiscordId) {
    debug("[guards] requireRecruiterOrAbove: granted (owner)");
    return { session };
  }

  // Check admin allowlist
  const adminIds = (process.env.ADMIN_DISCORD_IDS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (adminIds.includes(discordId)) {
    debug("[guards] requireRecruiterOrAbove: granted (admin)");
    return { session };
  }

  // Check recruiter or staff full roles (DB mirror first, live Discord API as fallback)
  const rolesResult = await getRolesForSession(session);
  let userRoles: string[] = rolesResult.roles ?? [];

  if (rolesResult.error === "UNAVAILABLE") {
    // DB mirror unavailable (member non lié ou sync en attente)
    // → fallback API Discord live, cohérent avec canAccessStaffPanel Phase 3
    try {
      const liveRoles = await getDiscordRolesForUser(discordId);
      if (liveRoles.length > 0) {
        debug("[guards] requireRecruiterOrAbove: DB mirror UNAVAILABLE, using live Discord roles", { discordId });
        userRoles = liveRoles;
      } else {
        return discordUnavailableResponse();
      }
    } catch {
      return discordUnavailableResponse();
    }
  }
  const hasRecruiterRole = isRecruiter(userRoles);
  const hasStaffFullRole = isStaffFull(userRoles);
  const hasAccess = hasRecruiterRole || hasStaffFullRole;

  if (!hasAccess) {
    const path = await getRequestPath();
    debug("[guards] requireRecruiterOrAbove: denied", {
      discordId,
      userRoles: userRoles.slice(0, 3),
      path,
    });

    const denyKey = `RECRUITER_DENIED:${discordId}:${path}`;
    if (shouldAudit(denyKey)) {
      void createAuditLog({
        actorType: "member",
        actorId: discordId,
        action: "RECRUITER_DENIED",
        entity: "Auth",
        entityId: discordId,
        entityName: "recruitment",
        meta: { reason: "missing_recruiter_or_staff_role", path },
      });
    }

    return new Response(null, {
      status: 307,
      headers: { Location: "/staff/forbidden" },
    });
  }

  const grantReason = hasStaffFullRole ? "staff_full" : "recruiter";
  debug("[guards] requireRecruiterOrAbove: granted", { discordId, grantReason });
  return { session };
}

/**
 * ✅ MVP guard "membre actif + permissions"
 * - Récupère discordId depuis la session (anti spoof)
 * - Vérifie isActive et gradeLevel
 * - Réponses JSON uniquement
 */
export async function requireActiveMember(
  minGradeLevel: number = GRADE_LEVELS.MEMBER
): Promise<GuardResult> {
  const session = await getSession();
  if (!session) return jsonError(401, "Unauthorized");
  const s: any = session;
  const u: any = session?.user ?? {};
  const discordId = s?.discordId ?? u?.discordId;

  if (!discordId) return jsonError(403, "Missing discordId");

  let familyId = DEFAULT_FAMILY_ID;
  try {
    familyId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  } catch {
    // keep slug fallback
  }

  const member = await prisma.member.findFirst({
    where: {
      discordId,
      familyId: { in: Array.from(new Set([familyId, DEFAULT_FAMILY_ID])) },
    },
    select: { id: true, isActive: true, gradeLevel: true, grade: true },
  });

  if (!member) return jsonError(403, "Member not found");

  if (!member.isActive) return jsonError(403, "Member inactive");

  if ((member.gradeLevel ?? 0) < minGradeLevel) {
    return jsonError(403, "Insufficient permissions");
  }

  return { session: { ...session, member, discordId } };
}

/**
 * ✅ MEMBER GUARD: Verify user is linked to a Member in database
 * 
 * Used on member-only routes: /dashboard, /banque, /activité, /me
 * 
 * Process:
 * 1. Get Discord ID from OAuth Account (providerAccountId) - source of truth
 * 2. Query Member by familyId + discordId
 * 3. If not found -> redirect to /login or show "Compte non lié"
 * 4. If found -> return OK with member scope
 * 
 * Returns:
 * - Response (redirect to /login): Not authenticated
 * - Response (redirect to /login?reason=not_linked): Not linked to Member
 * - GuardOk with session: Linked member with access granted
 */
export async function requireLinkedMember(): Promise<GuardResult> {
  const session = await getSession();
  
  if (!session) {
    return new Response(null, {
      status: 307,
      headers: { Location: "/login" },
    });
  }

  // Get Discord ID from OAuth Account (source of truth)
  const discordId = await getUserDiscordIdFromSession(session);

  if (!discordId) {
    debug("[memberGuard] no Discord ID found", {
      userId: (session as any)?.user?.id,
    });
    return new Response(null, {
      status: 307,
      headers: { Location: "/login" },
    });
  }

    let familyId = DEFAULT_FAMILY_ID;
    try {
      familyId = await resolveFamilyId(DEFAULT_FAMILY_ID);
    } catch {
      familyId = DEFAULT_FAMILY_ID;
    }

    const member = await prisma.member.findFirst({
      where: {
        discordId,
        familyId: {
          in: Array.from(new Set([familyId, DEFAULT_FAMILY_ID])),
        },
      },
      select: { id: true, discordId: true, rpName: true, steamId: true },
    });

  if (!member) {
    debug("[memberGuard] member not found", {
      discordId: discordId.substring(0, 6) + "...",
      memberFound: false,
    });
    return new Response(null, {
      status: 307,
      headers: { Location: "/login?reason=not_linked" },
    });
  }

  debug("[memberGuard] member found", {
    discordId: discordId.substring(0, 6) + "...",
    memberFound: true,
    rpName: member.rpName,
  });

  return { session };
}

/**
 * ✅ SECURITY: /staff/link access control
 * 
 * Rules:
 * 1. Must be Chef Famille (CHEF_FAMILLE_ROLE_ID) OR État-Major (ETAT_MAJOR_ROLE_ID)
 * 2. Must NOT be already linked (no steamId)
 * 3. Will check targetDiscordId !== sessionDiscordId in API (prevent self-linking)
 * 
 * Returns:
 * - 401: Not authenticated
 * - 403: Not Chef/État-Major OR already linked
 * - GuardOk with session if authorized
 */
export async function requireLinkAccess(): Promise<GuardResult> {
  const session = await getSession();
  if (!session) return jsonError(401, "Unauthorized");

  const s: any = session;
  const u: any = session?.user ?? {};
  const discordId = s?.discordId ?? u?.discordId;
  const userId = s?.userId ?? u?.id;

  if (!discordId || !userId) {
    return jsonError(401, "Missing authentication data");
  }

  // Check if user is already linked
  let linkFamilyId = DEFAULT_FAMILY_ID;
  try { linkFamilyId = await resolveFamilyId(DEFAULT_FAMILY_ID); } catch {}
  const member = await prisma.member.findFirst({
    where: { familyId: linkFamilyId, discordId },
    select: { id: true, steamId: true, discordId: true },
  });

  if (member && member.steamId) {
    // Already linked, deny access
    return jsonError(403, "ALREADY_LINKED");
  }

  const rolesResult = await getRolesForSession(session);
  if (rolesResult.error === "UNAVAILABLE") {
    return discordUnavailableResponse();
  }
  const roles = rolesResult.roles ?? [];
  const hasChefRole = hasAnyRole(roles, [CHEF_FAMILLE_ROLE_ID]);
  const hasEtatMajorRole = hasAnyRole(roles, [ETAT_MAJOR_ROLE_ID]);
  const hasAccess = hasChefRole || hasEtatMajorRole;

  if (!hasAccess) {
    const path = await getRequestPath();
    const denyKey = `LINK_ACCESS_DENIED:${discordId}:${path}`;
    if (shouldAudit(denyKey)) {
      void createAuditLog({
        actorType: "member",
        actorId: discordId,
        action: "LINK_ACCESS_DENIED",
        entity: "Auth",
        entityId: discordId,
        entityName: "staff/link",
        meta: { reason: "missing_role", path },
      });
    }

    return jsonError(403, "FORBIDDEN_NO_ROLE");
  }

  const path = await getRequestPath();
  const allowKey = `LINK_ACCESS_ALLOWED:${discordId}:${path}`;
  if (shouldAudit(allowKey)) {
    void createAuditLog({
      actorType: "member",
      actorId: discordId,
      action: "LINK_ACCESS_ALLOWED",
      entity: "Auth",
      entityId: discordId,
      entityName: "staff/link",
      meta: { reason: hasChefRole ? "chef_role" : "etat_major_role", path },
    });
  }

  return {
    session: {
      ...session,
      discordId,
      _auth: { hasChefRole, hasEtatMajorRole },
    },
  };
}

/**
 * Guard pour les actions D'ÉCRITURE SENSIBLES sur les ressources staff :
 *   - Créer / clôturer une sanction
 *   - Trancher une plainte (approve/reject)
 *   - Finaliser une réunion
 *   - Appliquer une promotion ou démote via le panel
 *   - Modifier les paramètres système
 *
 * Accepte : Owner, Admin, Chef Famille, Sous-Chef Famille, État-Major.
 * Refuse  : Encadrant (lecture seule), Recruteur, tout autre.
 *
 * Différence avec requireStaffFull() : ce guard EXCLUT volontairement
 * l'Encadrant, qui doit pouvoir CONSULTER ces pages mais pas y écrire.
 *
 * Usage : sur les routes API qui POST/PATCH/DELETE sur ces ressources.
 *   const guard = await requireFullWriter();
 *   if (guard instanceof Response) return guard;
 */
export async function requireFullWriter(): Promise<GuardResult> {
  logDiscordRoleConfig("requireFullWriter");
  const session = await getSession();
  if (!session) return jsonError(401, "Unauthorized");

  const discordId = await getUserDiscordIdFromSession(session);
  if (!discordId) return jsonError(403, "Missing discordId");

  // Override owner / admin (env-based)
  const ownerDiscordId = process.env.OWNER_DISCORD_ID ?? "";
  if (ownerDiscordId && discordId === ownerDiscordId) {
    return { session: { ...session, discordId, _auth: { isOwner: true } as any } };
  }
  const adminIds = (process.env.ADMIN_DISCORD_IDS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (adminIds.includes(discordId)) {
    return { session: { ...session, discordId, _auth: { isAdmin: true } as any } };
  }

  // Vérifie les rôles Discord, et applique isFullWriter (= EM/Chef sans Encadrant).
  const rolesResult = await getRolesForSession(session);
  if (rolesResult.error === "UNAVAILABLE") {
    return discordUnavailableResponse();
  }

  const { isFullWriter } = await import("@/lib/discord-roles");
  const ok = isFullWriter(rolesResult.roles ?? []);
  if (!ok) {
    // Audit log dédié pour tracer les tentatives Encadrant → actions bloquées.
    const path = await getRequestPath();
    const denyKey = `WRITER_DENIED:${discordId}:${path}`;
    if (shouldAudit(denyKey)) {
      void createAuditLog({
        actorType: "member",
        actorId: discordId,
        action: "WRITER_DENIED",
        entity: "Auth",
        entityId: discordId,
        entityName: "staff/write",
        meta: { reason: "encadrant_or_below", path },
      });
    }
    return jsonError(403, "FORBIDDEN_ACTION");
  }

  return { session: { ...session, discordId } };
}

/**
 * Guard ultra-restrictif : SEULEMENT Chef Famille + Sous-Chef Famille.
 *
 * Exclut explicitement État-Major (qui passe `requireFullWriter`), Encadrant
 * et Recruteur. Réservé aux ressources de très haute sensibilité comme le
 * cookie de session admin LYG (qui permet d'éditer la famille en temps réel).
 *
 * Override owner / admin (env-based) toujours accepté.
 */
export async function requireChefFamille(): Promise<GuardResult> {
  logDiscordRoleConfig("requireChefFamille");
  const session = await getSession();
  if (!session) return jsonError(401, "Unauthorized");

  const discordId = await getUserDiscordIdFromSession(session);
  if (!discordId) return jsonError(403, "Missing discordId");

  // Override owner / admin
  const ownerDiscordId = process.env.OWNER_DISCORD_ID ?? "";
  if (ownerDiscordId && discordId === ownerDiscordId) {
    return { session: { ...session, discordId } };
  }
  const adminIds = (process.env.ADMIN_DISCORD_IDS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (adminIds.includes(discordId)) {
    return { session: { ...session, discordId } };
  }

  const rolesResult = await getRolesForSession(session);
  if (rolesResult.error === "UNAVAILABLE") {
    return discordUnavailableResponse();
  }

  const hasChefRole = hasAnyRole(rolesResult.roles, [
    CHEF_FAMILLE_ROLE_ID,
    SOUS_CHEF_FAMILLE_ROLE_ID,
  ]);

  if (!hasChefRole) {
    const path = await getRequestPath();
    const denyKey = `CHEF_FAMILLE_DENIED:${discordId}:${path}`;
    if (shouldAudit(denyKey)) {
      void createAuditLog({
        actorType: "member",
        actorId: discordId,
        action: "CHEF_FAMILLE_DENIED",
        entity: "Auth",
        entityId: discordId,
        entityName: "staff/chef-famille",
        meta: { reason: "not_chef_nor_sous_chef", path },
      });
    }
    return jsonError(403, "CHEF_FAMILLE_REQUIRED");
  }

  return { session: { ...session, discordId } };
}
