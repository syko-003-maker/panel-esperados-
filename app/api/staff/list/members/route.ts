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
 * GET /api/staff/list/members
 * Paginated list of members with search
 */
export async function GET(req: NextRequest) {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const searchParams = req.nextUrl.searchParams;
  const { cursor, limit } = parsePaginationParams(searchParams);
  const { q, activeOnly } = parseSearchParams(searchParams);
  const grade = searchParams.get("grade") ?? null;
  const useCursor = searchParams.get("pagination") !== "offset";

  try {
    // ✅ CRITICAL: Resolve Family ID from slug
    const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
    
    debug("[staff/list/members] Family resolved", {
      slug: DEFAULT_FAMILY_ID,
      dbId: familyDbId,
      type: typeof familyDbId,
    });

    // DEBUG: Test raw query without any filters first
    console.log("\n=== DEBUG: RAW COUNT TEST ===");
    const countAll = await prisma.member.count({});
    const countByFamilyId = await prisma.member.count({ where: { familyId: familyDbId } });
    console.log(`Total members in DB: ${countAll}`);
    console.log(`Members with familyId = "${familyDbId}": ${countByFamilyId}`);

    // DEBUG: Test with all families to see what familyIds exist
    const familiesInDb = await prisma.family.findMany({
      select: { id: true, slug: true }
    });
    console.log(`Families in DB:`, familiesInDb);

    // DEBUG: Get first 5 members to see their familyId
    const sampleMembers = await prisma.member.findMany({
      take: 5,
      select: { id: true, discordId: true, rpName: true, familyId: true }
    });
    console.log(`Sample members (first 5):`, sampleMembers);
    console.log("=== END DEBUG ===\n");

    // Build where clause
    const where: any = { familyId: familyDbId };

    debug("[staff/list/members] Initial where clause", { where });

    // Active filter
    if (activeOnly) {
      where.isActive = true;
      debug("[staff/list/members] Added isActive filter");
    }

    // Grade filter
    if (grade) {
      where.grade = grade;
      debug("[staff/list/members] Added grade filter", { grade });
    }

    // Search filter
    if (q) {
      where.OR = [
        { rpName: { contains: q, mode: "insensitive" } },
        { discordId: { equals: q } },
        { steamId: { equals: q } },
      ];
      debug("[staff/list/members] Added search filter", { q });
    }

    // Cursor pagination
    if (useCursor && cursor) {
      const cursorWhere = buildCursorWhere(cursor);
      if (Object.keys(cursorWhere).length > 0) {
        where.AND = [cursorWhere];
        debug("[staff/list/members] Added cursor filter");
      }
    }

    debug("[staff/list/members] Final where clause", { where });

    if (useCursor) {
      // Cursor-based pagination
      debug("[staff/list/members] Using cursor pagination", { cursor, limit });
      
      const items = await prisma.member.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        select: {
          id: true,
          discordId: true,
          steamId: true,
          rpName: true,
          grade: true,
          gradeLevel: true,
          rankRoleId: true,
          rankLabel: true,
          isActive: true,
          createdAt: true,
        },
      });

      // Debug: Log total in DB vs returned
      const totalInDb = await prisma.member.count({ where });
      console.log(`[Cursor] Query where:`, JSON.stringify(where, null, 2));
      console.log(`[Cursor] Total in DB: ${totalInDb}, Returned: ${items.length}`);
      
      debug("[staff/list/members] Cursor pagination result", {
        totalInDb,
        returned: items.length,
        familyDbId,
        firstItem: items[0] ? { id: items[0].id, rpName: items[0].rpName } : null,
      });

      const result = buildPaginatedResult(items, limit);

      return NextResponse.json({
        ok: true,
        ...result,
      });
    } else {
      // Offset-based pagination
      const { page, pageSize, skip } = parseOffsetParams(searchParams);
      debug("[staff/list/members] Using offset pagination", { page, pageSize, skip });

      const [items, total] = await Promise.all([
        prisma.member.findMany({
          where,
          orderBy: [{ gradeLevel: "desc" }, { rpName: "asc" }],
          take: pageSize,
          skip,
          select: {
            id: true,
            discordId: true,
            steamId: true,
            rpName: true,
            grade: true,
            gradeLevel: true,
            rankRoleId: true,
            rankLabel: true,
            isActive: true,
            createdAt: true,
          },
        }),
        prisma.member.count({ where }),
      ]);

      // Debug: Log total in DB vs returned
      console.log(`[Offset] Query where:`, JSON.stringify(where, null, 2));
      console.log(`[Offset] Total in DB: ${total}, Returned: ${items.length}`);

      debug("[staff/list/members] Offset pagination result", {
        total,
        returned: items.length,
        page,
        pageSize,
        familyDbId,
        firstItem: items[0] ? { id: items[0].id, rpName: items[0].rpName } : null,
      });

      const result = buildOffsetResult(items, page, pageSize, total);

      return NextResponse.json({
        ok: true,
        ...result,
      });
    }
  } catch (error: any) {
    logError("[/api/staff/list/members GET]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to fetch members" },
      { status: 500 }
    );
  }
}
