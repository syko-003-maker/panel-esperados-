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
 * GET /api/staff/list/sanctions
 * Paginated list of sanctions with search
 */
export async function GET(req: NextRequest) {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const searchParams = req.nextUrl.searchParams;
  const { cursor, limit } = parsePaginationParams(searchParams);
  const { q, status, type, activeOnly } = parseSearchParams(searchParams);
  const useCursor = searchParams.get("pagination") !== "offset";

  try {
    // ✅ CRITICAL: Resolve Family ID from slug
    const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);

    debug("[staff/list/sanctions] Family resolved", {
      slug: DEFAULT_FAMILY_ID,
      dbId: familyDbId,
    });

    // Build where clause
    const where: any = { familyId: familyDbId };

    // Status filter
    if (status) {
      where.status = status;
    } else if (activeOnly) {
      where.status = "ACTIVE";
    }

    // Type filter
    if (type) {
      where.type = type;
    }

    // Search filter - need to join with member
    let memberDiscordIds: string[] | null = null;
    if (q) {
      // First find matching members
      const matchingMembers = await prisma.member.findMany({
        where: {
          familyId: familyDbId,
          OR: [
            { rpName: { contains: q, mode: "insensitive" } },
            { discordId: { equals: q } },
            { steamId: { equals: q } },
          ],
        },
        select: { discordId: true },
        take: 100,
      });
      memberDiscordIds = matchingMembers.map((m) => m.discordId).filter(Boolean) as string[];

      if (memberDiscordIds.length > 0) {
        where.discordId = { in: memberDiscordIds };
      } else if (q) {
        // Direct match on discordId
        where.discordId = q;
      }
    }

    // Cursor pagination
    if (useCursor && cursor) {
      const cursorWhere = buildCursorWhere(cursor);
      if (Object.keys(cursorWhere).length > 0) {
        where.AND = where.AND ? [...where.AND, cursorWhere] : [cursorWhere];
      }
    }

    if (useCursor) {
      // Cursor-based pagination
      const items = await prisma.sanction.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        select: {
          id: true,
          discordId: true,
          type: true,
          status: true,
          reason: true,
          source: true,
          startAt: true,
          endAt: true,
          createdAt: true,
        },
      });

      // Enrich with member names
      const discordIds = [...new Set(items.map((s) => s.discordId))];
      const members = await prisma.member.findMany({
        where: { familyId: familyDbId, discordId: { in: discordIds } },
        select: { discordId: true, rpName: true },
      });
      const memberMap = new Map(members.map((m) => [m.discordId, m.rpName]));

      const enrichedItems = items.map((item) => ({
        ...item,
        memberRpName: memberMap.get(item.discordId) ?? null,
      }));

      const result = buildPaginatedResult(enrichedItems, limit);

      return NextResponse.json({
        ok: true,
        ...result,
      });
    } else {
      // Offset-based pagination
      const { page, pageSize, skip } = parseOffsetParams(searchParams);

      const [items, total] = await Promise.all([
        prisma.sanction.findMany({
          where,
          orderBy: [{ createdAt: "desc" }],
          take: pageSize,
          skip,
          select: {
            id: true,
            discordId: true,
            type: true,
            status: true,
            reason: true,
            source: true,
            startAt: true,
            endAt: true,
            createdAt: true,
          },
        }),
        prisma.sanction.count({ where }),
      ]);

      // Enrich with member names
      const discordIds2 = [...new Set(items.map((s) => s.discordId))];
      const members2 = await prisma.member.findMany({
        where: { familyId: familyDbId, discordId: { in: discordIds2 } },
        select: { discordId: true, rpName: true },
      });
      const memberMap2 = new Map(members2.map((m) => [m.discordId, m.rpName]));

      const enrichedItems = items.map((item) => ({
        ...item,
        memberRpName: memberMap2.get(item.discordId) ?? null,
      }));

      const result = buildOffsetResult(enrichedItems, page, pageSize, total);

      return NextResponse.json({
        ok: true,
        ...result,
      });
    }
  } catch (error: any) {
    console.error("[/api/staff/list/sanctions GET]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to fetch sanctions" },
      { status: 500 }
    );
  }
}
