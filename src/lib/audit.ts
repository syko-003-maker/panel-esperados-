/**
 * Audit Trail System
 * Centralized logging for all actions in the panel
 */

import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID, toFamilyCuid } from "@/lib/family";
import { debug, error as logError } from "@/lib/logger";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type ActorType = "staff" | "worker" | "system" | "member";

export type AuditAction =
  | "CREATED"
  | "UPDATED"
  | "DELETED"
  | "CLOSED"
  | "FINALIZED"
  | "APPROVED"
  | "REJECTED"
  | "CLAIMED"
  | "SYNCED"
  | "IMPORTED"
  | "COMPUTED"
  | "TRIGGERED";

export type AuditEntity =
  | "Recruitment"
  | "Complaint"
  | "Member"
  | "Sanction"
  | "Meeting"
  | "MeetingDecision"
  | "Absence"
  | "AbsenceJustification"
  | "SanctionJustification"
  | "ActivitySnapshot"
  | "ActivityRule"
  | "GradeHistory"
  | "ImportRun"
  | "DiscordConfig";

export type AuditLogInput = {
  familyId?: string;
  actorType: ActorType;
  actorId?: string | null;
  actorMemberId?: string | null;
  actorName?: string | null;
  action: AuditAction | string;
  entity: AuditEntity | string;
  entityId: string;
  entityName?: string | null;
  meta?: Record<string, unknown> | null;
};

// ─────────────────────────────────────────────────────────────
// Core Functions
// ─────────────────────────────────────────────────────────────

/**
 * Create an audit log entry
 */
export async function createAuditLog(input: AuditLogInput): Promise<string | null> {
  const DEBUG = process.env.DEBUG_AUTH === "1";
  
  try {
    const log = await prisma.auditLog.create({
      data: {
        // Le slug est accepté en entrée (nombreux appelants historiques), mais
        // la ligne écrite porte toujours le cuid — convention du projet.
        familyId: await toFamilyCuid(input.familyId ?? DEFAULT_FAMILY_ID),
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        actorMemberId: input.actorMemberId ?? null,
        actorName: input.actorName ?? null,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        entityName: input.entityName ?? null,
        meta: input.meta as any,
      } as any,
    });

    if (DEBUG) {
      debug("[AUDIT]", {
        id: log.id,
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
      });
    }

    return log.id;
  } catch (error) {
     logError("[audit] Failed to create audit log:", error);
    return null;
  }
}

/**
 * Create audit log for staff action
 */
export async function auditStaffAction(
  userId: string,
  userName: string | null | undefined,
  action: AuditAction | string,
  entity: AuditEntity | string,
  entityId: string,
  options?: {
    familyId?: string;
    entityName?: string;
    meta?: Record<string, unknown>;
  }
): Promise<string | null> {
  return createAuditLog({
    familyId: options?.familyId,
    actorType: "staff",
    actorId: userId,
    actorName: userName ?? "Staff",
    action,
    entity,
    entityId,
    entityName: options?.entityName,
    meta: options?.meta,
  });
}

/**
 * Create audit log for worker action
 */
export async function auditWorkerAction(
  action: AuditAction | string,
  entity: AuditEntity | string,
  entityId: string,
  options?: {
    familyId?: string;
    entityName?: string;
    meta?: Record<string, unknown>;
    workerName?: string;
  }
): Promise<string | null> {
  return createAuditLog({
    familyId: options?.familyId,
    actorType: "worker",
    actorId: null,
    actorName: options?.workerName ?? "Discord Worker",
    action,
    entity,
    entityId,
    entityName: options?.entityName,
    meta: options?.meta,
  });
}

/**
 * Create audit log for system action
 */
export async function auditSystemAction(
  action: AuditAction | string,
  entity: AuditEntity | string,
  entityId: string,
  options?: {
    familyId?: string;
    entityName?: string;
    meta?: Record<string, unknown>;
    systemName?: string;
  }
): Promise<string | null> {
  return createAuditLog({
    familyId: options?.familyId,
    actorType: "system",
    actorId: null,
    actorName: options?.systemName ?? "System",
    action,
    entity,
    entityId,
    entityName: options?.entityName,
    meta: options?.meta,
  });
}

/**
 * Create audit log for member action (self-service)
 */
export async function auditMemberAction(
  discordId: string,
  memberName: string | null | undefined,
  action: AuditAction | string,
  entity: AuditEntity | string,
  entityId: string,
  options?: {
    familyId?: string;
    entityName?: string;
    meta?: Record<string, unknown>;
  }
): Promise<string | null> {
  return createAuditLog({
    familyId: options?.familyId,
    actorType: "member",
    actorId: discordId,
    actorName: memberName ?? "Member",
    action,
    entity,
    entityId,
    entityName: options?.entityName,
    meta: options?.meta,
  });
}

// ─────────────────────────────────────────────────────────────
// Query Functions
// ─────────────────────────────────────────────────────────────

export type AuditLogFilters = {
  familyId?: string;
  entity?: string;
  entityId?: string;
  actorType?: ActorType;
  actorId?: string;
  action?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
};

/**
 * Query audit logs with filters
 */
export async function queryAuditLogs(filters: AuditLogFilters) {
  const where: Record<string, unknown> = {};

  if (filters.familyId) where.familyId = filters.familyId;
  if (filters.entity) where.entity = filters.entity;
  if (filters.entityId) where.entityId = filters.entityId;
  if (filters.actorType) where.actorType = filters.actorType;
  if (filters.actorId) where.actorId = filters.actorId;
  if (filters.action) where.action = filters.action;

  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) (where.createdAt as any).gte = filters.startDate;
    if (filters.endDate) (where.createdAt as any).lte = filters.endDate;
  }

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filters.limit ?? 50,
      skip: filters.offset ?? 0,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return { logs, total };
}

/**
 * Get audit logs for a specific entity
 */
export async function getEntityAuditLogs(entity: string, entityId: string, limit = 20) {
  return prisma.auditLog.findMany({
    where: { entity, entityId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
