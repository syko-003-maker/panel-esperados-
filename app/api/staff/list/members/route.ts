import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";
import { debug, error as logError } from "@/lib/logger";
import { parseAbsenceMeta } from "@/lib/meetings";
import {
  parsePaginationParams,
  parseSearchParams,
  buildCursorWhere,
  buildPaginatedResult,
  parseOffsetParams,
  buildOffsetResult,
} from "@/lib/pagination";
import {
  isActiveMembersScopeMember,
  isDisplayableStaffMember,
} from "@/lib/staff/member-scope";

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
          isGhost: true,
          discordRoleIds: true,
          createdAt: true,
        },
      });

      const scopedItems = items.filter(activeOnly ? isActiveMembersScopeMember : isDisplayableStaffMember);

      const now = new Date();
      const memberIds = scopedItems.map((item) => item.id);
      const discordIds = scopedItems
        .map((item) => item.discordId)
        .filter((value): value is string => typeof value === "string" && value.trim() !== "");
      const activeAbsences = (memberIds.length > 0 || discordIds.length > 0)
        ? await prisma.absence.findMany({
            where: {
              familyId: familyDbId,
              status: "APPROVED",
              startAt: { lte: now },
              endAt: { gte: now },
              OR: [
                ...(memberIds.length > 0 ? [{ memberId: { in: memberIds } }] : []),
                ...(discordIds.length > 0 ? [{ discordId: { in: discordIds } }] : []),
              ],
            },
            orderBy: [{ endAt: "asc" }, { createdAt: "desc" }],
            select: { id: true, memberId: true, discordId: true, reason: true, notes: true, startAt: true, endAt: true },
          })
        : [];

      const activeByMemberId = new Map<string, any>();
      const activeByDiscordId = new Map<string, any>();
      for (const absence of activeAbsences) {
        const meta = parseAbsenceMeta(absence.notes);
        const payload = {
          id: absence.id,
          type: meta.type,
          meetingDate: meta.meetingDate,
          reason: absence.reason,
          startAt: absence.startAt.toISOString(),
          endAt: absence.endAt.toISOString(),
        };
        if (absence.memberId && !activeByMemberId.has(absence.memberId)) activeByMemberId.set(absence.memberId, payload);
        if (absence.discordId && !activeByDiscordId.has(absence.discordId)) activeByDiscordId.set(absence.discordId, payload);
      }

      const itemsWithAbsence = scopedItems.map((item) => ({
        ...item,
        activeAbsence:
          activeByMemberId.get(item.id) ??
          (item.discordId ? activeByDiscordId.get(item.discordId) ?? null : null),
      }));

      // Debug: Log total in DB vs returned
      const totalInDb = await prisma.member.count({ where });
      console.log(`[Cursor] Query where:`, JSON.stringify(where, null, 2));
      console.log(`[Cursor] Total in DB: ${totalInDb}, Returned in scope: ${scopedItems.length}`);
      
      debug("[staff/list/members] Cursor pagination result", {
        totalInDb,
        returned: scopedItems.length,
        familyDbId,
        firstItem: scopedItems[0] ? { id: scopedItems[0].id, rpName: scopedItems[0].rpName } : null,
      });

      const result = buildPaginatedResult(itemsWithAbsence, limit);

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
            isGhost: true,
            discordRoleIds: true,
            createdAt: true,
          },
        }),
        prisma.member.count({ where }),
      ]);

        const scopedItems = items.filter(activeOnly ? isActiveMembersScopeMember : isDisplayableStaffMember);

      const now = new Date();
        const memberIds = scopedItems.map((item) => item.id);
        const discordIds = scopedItems
        .map((item) => item.discordId)
        .filter((value): value is string => typeof value === "string" && value.trim() !== "");
      const activeAbsences = (memberIds.length > 0 || discordIds.length > 0)
        ? await prisma.absence.findMany({
            where: {
              familyId: familyDbId,
              status: "APPROVED",
              startAt: { lte: now },
              endAt: { gte: now },
              OR: [
                ...(memberIds.length > 0 ? [{ memberId: { in: memberIds } }] : []),
                ...(discordIds.length > 0 ? [{ discordId: { in: discordIds } }] : []),
              ],
            },
            orderBy: [{ endAt: "asc" }, { createdAt: "desc" }],
            select: { id: true, memberId: true, discordId: true, reason: true, notes: true, startAt: true, endAt: true },
          })
        : [];

      const activeByMemberId = new Map<string, any>();
      const activeByDiscordId = new Map<string, any>();
      for (const absence of activeAbsences) {
        const meta = parseAbsenceMeta(absence.notes);
        const payload = {
          id: absence.id,
          type: meta.type,
          meetingDate: meta.meetingDate,
          reason: absence.reason,
          startAt: absence.startAt.toISOString(),
          endAt: absence.endAt.toISOString(),
        };
        if (absence.memberId && !activeByMemberId.has(absence.memberId)) activeByMemberId.set(absence.memberId, payload);
        if (absence.discordId && !activeByDiscordId.has(absence.discordId)) activeByDiscordId.set(absence.discordId, payload);
      }

      const itemsWithAbsence = scopedItems.map((item) => ({
        ...item,
        activeAbsence:
          activeByMemberId.get(item.id) ??
          (item.discordId ? activeByDiscordId.get(item.discordId) ?? null : null),
      }));

      // Debug: Log total in DB vs returned
      console.log(`[Offset] Query where:`, JSON.stringify(where, null, 2));
      console.log(`[Offset] Total in DB: ${total}, Returned in scope: ${scopedItems.length}`);

      debug("[staff/list/members] Offset pagination result", {
        total,
        returned: scopedItems.length,
        page,
        pageSize,
        familyDbId,
        firstItem: scopedItems[0] ? { id: scopedItems[0].id, rpName: scopedItems[0].rpName } : null,
      });

      const result = buildOffsetResult(itemsWithAbsence, page, pageSize, total);

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
