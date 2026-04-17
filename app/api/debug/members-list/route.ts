import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";
import { parseOffsetParams, buildOffsetResult } from "@/lib/pagination";
import { requirePrivileged } from "@/lib/guards";

/**
 * PUBLIC DEBUG: /api/debug/members-list
 * No auth required - for testing
 */
export async function GET(req: NextRequest) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  try {
    const searchParams = req.nextUrl.searchParams;
    const { page, pageSize, skip } = parseOffsetParams(searchParams);

    // Resolve family
    const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
    console.log(`[debug] Resolved familyId: ${familyDbId.substring(0, 8)}...`);

    // Simple where clause - NO FILTERS
    const where: any = { familyId: familyDbId };

    console.log(`[debug] Where clause:`, where);

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
          isActive: true,
          joinedAt: true,
          createdAt: true,
        },
      }),
      prisma.member.count({ where }),
    ]);

    console.log(`[debug] Query result: total=${total}, returned=${items.length}`);

    const result = buildOffsetResult(items, page, pageSize, total);

    return NextResponse.json({
      ok: true,
      ...result,
      debug: {
        familyDbId: familyDbId.substring(0, 8) + "...",
        page,
        pageSize,
        total,
        returned: items.length,
      }
    });
  } catch (error: any) {
    console.error("[debug/members-list ERROR]", error);
    return NextResponse.json({
      ok: false,
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
