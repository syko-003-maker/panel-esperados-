import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRecruiterOrAbove } from "@/lib/guards";
import { logInfo } from "@/lib/obs";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";
import { debug, error as logError } from "@/lib/logger";
import { RecruitmentLegacyStatus } from "@prisma/client";
import {
  parsePaginationParams,
  parseSearchParams,
  buildCursorWhere,
  buildPaginatedResult,
  parseOffsetParams,
  buildOffsetResult,
} from "@/lib/pagination";

function mapRecruitmentStatusQuery(statusRaw: string | null): RecruitmentLegacyStatus | undefined {
  if (!statusRaw) return undefined;
  const s = statusRaw.trim().toUpperCase();

  const values = Object.values(RecruitmentLegacyStatus) as string[];

  // Si le query param correspond déjà exactement à l'enum DB, on le garde
  if (values.includes(s)) return s as RecruitmentLegacyStatus;

  // Mapping "API -> DB" tolérant (selon ton schema actuel)
  // OPEN -> cherche un équivalent existant dans l'enum Prisma
  if (s === "OPEN") {
    const candidate =
      values.find((v) => v === "PENDING") ??
      values.find((v) => v === "OPEN") ??
      values.find((v) => v === "NEW") ??
      values.find((v) => v === "CREATED");
    return candidate ? (candidate as RecruitmentLegacyStatus) : undefined;
  }

  // FINI/CLOSED -> cherche un équivalent existant dans l'enum Prisma
  if (s === "FINI" || s === "CLOSED") {
    const candidate =
      values.find((v) => v === "CLOSED") ??
      values.find((v) => v === "DONE") ??
      values.find((v) => v === "FINI") ??
      values.find((v) => v === "COMPLETED");
    return candidate ? (candidate as RecruitmentLegacyStatus) : undefined;
  }

  // Sinon : on ignore le filtre plutôt que crasher
  return undefined;
}

/**
 * GET /api/staff/list/recruitments
 * Paginated list of recruitments with search
 */
export async function GET(req: NextRequest) {
  const guard = await requireRecruiterOrAbove();
  if (guard instanceof Response) return guard;

  const startTime = Date.now();
  const dashboardRequestId = req.headers.get("x-dashboard-request-id");
  const dashboardSection = req.headers.get("x-dashboard-section") ?? "recruitments";
  const logDashboardDone = () => {
    if (dashboardRequestId) {
      logInfo("dashboard_fetch_done", {
        requestId: dashboardRequestId,
        section: dashboardSection,
        durationMs: Date.now() - startTime,
      });
    }
  };

  const searchParams = req.nextUrl.searchParams;
  const { cursor, limit } = parsePaginationParams(searchParams);
  const { q, status } = parseSearchParams(searchParams);
  const useCursor = searchParams.get("pagination") !== "offset";

  try {
    // ✅ CRITICAL: Resolve Family ID from slug
    const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);

    debug("[staff/list/recruitments] Family resolved", {
      slug: DEFAULT_FAMILY_ID,
      dbId: familyDbId,
    });

    // Build where clause
    const where: any = { familyId: familyDbId };

    // Status filter
    const mapped = mapRecruitmentStatusQuery(status);
    if (mapped) {
      where.status = mapped;
    }

    // Search filter
    if (q) {
      where.OR = [
        { ticketKey: { startsWith: q.toUpperCase() } },
        { rpName: { contains: q, mode: "insensitive" } },
        { discordId: { equals: q } },
        { steamId: { equals: q } },
        { authorTag: { contains: q, mode: "insensitive" } },
      ];
    }

    // Cursor pagination
    if (useCursor && cursor) {
      const cursorWhere = buildCursorWhere(cursor);
      if (Object.keys(cursorWhere).length > 0) {
        where.AND = [cursorWhere];
      }
    }

    if (useCursor) {
      // Cursor-based pagination
      const items = await prisma.recruitment.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        select: {
          id: true,
          ticketKey: true,
          rpName: true,
          discordId: true,
          steamId: true,
          status: true,
          authorTag: true,
          createdAt: true,
          closedAt: true,
        },
      });

      const result = buildPaginatedResult(items, limit);

      return NextResponse.json({
        ok: true,
        ...result,
      });
    } else {
      // Offset-based pagination
      const { page, pageSize, skip } = parseOffsetParams(searchParams);

      const [items, total] = await Promise.all([
        prisma.recruitment.findMany({
          where,
          orderBy: [{ createdAt: "desc" }],
          take: pageSize,
          skip,
          select: {
            id: true,
            ticketKey: true,
            rpName: true,
            discordId: true,
            steamId: true,
            status: true,
            authorTag: true,
            createdAt: true,
            closedAt: true,
          },
        }),
        prisma.recruitment.count({ where }),
      ]);

      const result = buildOffsetResult(items, page, pageSize, total);

      return NextResponse.json({
        ok: true,
        ...result,
      });
    }
  } catch (error: any) {
    const errMsg = error?.message ?? String(error);
    console.error("[/api/staff/list/recruitments GET] error:", errMsg);
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  } finally {
    logDashboardDone();
  }
}
