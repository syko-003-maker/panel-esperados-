import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";
import { debug, error as logError } from "@/lib/logger";
import {
  parsePaginationParams,
  parseSearchParams,
  buildCursorWhere,
  buildPaginatedResult,
  parseOffsetParams,
  buildOffsetResult,
} from "@/lib/pagination";

/**
 * GET /api/staff/list/complaints
 * Paginated list of complaints with search
 */
export async function GET(req: NextRequest) {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const searchParams = req.nextUrl.searchParams;
  const { cursor, limit } = parsePaginationParams(searchParams);
  const { q, status } = parseSearchParams(searchParams);
  const useCursor = searchParams.get("pagination") !== "offset";

  try {
    // ✅ CRITICAL: Resolve Family ID from slug
    const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);

    debug("[staff/list/complaints] Family resolved", {
      slug: DEFAULT_FAMILY_ID,
      dbId: familyDbId,
    });

    // Build where clause
    const where: any = { familyId: familyDbId };

    // Status filter
    if (status) {
      where.status = status;
    }

    // Search filter
    if (q) {
      where.OR = [
        { ticketKey: { startsWith: q.toUpperCase() } },
        { targetName: { contains: q, mode: "insensitive" } },
        { authorRpName: { contains: q, mode: "insensitive" } },
        { authorDiscordId: { equals: q } },
        { title: { contains: q, mode: "insensitive" } },
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
      const items = await prisma.complaint.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        select: {
          id: true,
          ticketKey: true,
          title: true,
          targetName: true,
          authorRpName: true,
          authorDiscordId: true,
          status: true,
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
        prisma.complaint.findMany({
          where,
          orderBy: [{ createdAt: "desc" }],
          take: pageSize,
          skip,
          select: {
            id: true,
            ticketKey: true,
            title: true,
            targetName: true,
            authorRpName: true,
            authorDiscordId: true,
            status: true,
            createdAt: true,
            closedAt: true,
          },
        }),
        prisma.complaint.count({ where }),
      ]);

      const result = buildOffsetResult(items, page, pageSize, total);

      return NextResponse.json({
        ok: true,
        ...result,
      });
    }
  } catch (error: any) {
    console.error("[/api/staff/list/complaints GET]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to fetch complaints" },
      { status: 500 }
    );
  }
}
