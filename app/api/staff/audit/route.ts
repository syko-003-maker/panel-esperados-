import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePrivileged } from "@/lib/guards";
import { DEFAULT_FAMILY_ID } from "@/lib/family";

/**
 * GET /api/staff/audit
 * List audit logs with filters
 */
export async function GET(req: NextRequest) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const familyId = req.nextUrl.searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;
  const entity = req.nextUrl.searchParams.get("entity");
  const entityId = req.nextUrl.searchParams.get("entityId");
  const actorType = req.nextUrl.searchParams.get("actorType");
  const actorId = req.nextUrl.searchParams.get("actorId");
  const action = req.nextUrl.searchParams.get("action");
  const startDate = req.nextUrl.searchParams.get("startDate");
  const endDate = req.nextUrl.searchParams.get("endDate");
  const pageRaw = parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10);
  const pageSizeRaw = parseInt(req.nextUrl.searchParams.get("pageSize") ?? "50", 10);

  const page = Math.max(1, pageRaw);
  const pageSize = Math.min(Math.max(1, pageSizeRaw), 100);
  const skip = (page - 1) * pageSize;

  try {
    const where: Record<string, unknown> = { familyId };

    if (entity) where.entity = entity;
    if (entityId) where.entityId = entityId;
    if (actorType) where.actorType = actorType;
    if (actorId) where.actorId = actorId;
    if (action) where.action = action;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        if (!isNaN(start.getTime())) (where.createdAt as any).gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        if (!isNaN(end.getTime())) (where.createdAt as any).lte = end;
      }
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: pageSize,
        skip,
      }),
      prisma.auditLog.count({ where }),
    ]);

    // Get unique entities and actions for filters
    const [entities, actions, actorTypes] = await Promise.all([
      prisma.auditLog.groupBy({
        by: ["entity"],
        where: { familyId },
        _count: true,
      }),
      prisma.auditLog.groupBy({
        by: ["action"],
        where: { familyId },
        _count: true,
      }),
      prisma.auditLog.groupBy({
        by: ["actorType"],
        where: { familyId },
        _count: true,
      }),
    ]);

    return NextResponse.json({
      ok: true,
      logs,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      filters: {
        entities: entities.map((e) => ({ value: e.entity, count: e._count })),
        actions: actions.map((a) => ({ value: a.action, count: a._count })),
        actorTypes: actorTypes.map((a) => ({ value: a.actorType, count: a._count })),
      },
    });
  } catch (error: any) {
    console.error("[/api/staff/audit GET]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to fetch audit logs" },
      { status: 500 }
    );
  }
}
