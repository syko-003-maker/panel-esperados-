import { NextResponse } from "next/server";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID } from "@/lib/family";

export async function GET(req: Request) {
  // ✅ PATCH: Unified staff protection
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  try {
    const { searchParams } = new URL(req.url);
    const pageRaw = Number(searchParams.get("page") ?? "1");
    const pageSizeRaw = Number(searchParams.get("pageSize") ?? "50");
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const pageSize = Math.min(Math.max(Number.isFinite(pageSizeRaw) ? pageSizeRaw : 50, 1), 100);
    const skip = (page - 1) * pageSize;

    // familyId client ignoré : pas de lecture cross-famille des journaux.
    const familyId = DEFAULT_FAMILY_ID;
    const entity = searchParams.get("entity") ?? undefined;
    const actorId = searchParams.get("actorId") ?? undefined;

    const where: any = { familyId };
    if (entity) where.entity = entity;
    if (actorId) where.actorId = actorId;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          action: true,
          entity: true,
          entityId: true,
          entityName: true,
          actorType: true,
          actorName: true,
          createdAt: true,
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        logs: logs.map((log) => ({
          ...log,
          createdAt: log.createdAt.toISOString(),
        })),
        pagination: {
          page,
          pageSize,
          total,
          hasMore: skip + logs.length < total,
        },
      },
    });
  } catch (error: any) {
    console.error("[GET /api/staff/logs] Error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal error" },
      { status: 500 }
    );
  }
}
