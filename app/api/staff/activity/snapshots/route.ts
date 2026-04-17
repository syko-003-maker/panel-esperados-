import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePrivileged } from "@/lib/guards";
import { DEFAULT_FAMILY_ID } from "@/lib/family";
import { getMemberScopeFlags, isActiveMembersScopeMember } from "@/lib/staff/member-scope";

/**
 * GET /api/staff/activity/snapshots
 * List activity snapshots with filters
 */
export async function GET(req: NextRequest) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const familyId = req.nextUrl.searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;
  const memberDiscordId = req.nextUrl.searchParams.get("memberDiscordId");
  const status = req.nextUrl.searchParams.get("status");
  const periodStartRaw = req.nextUrl.searchParams.get("periodStart");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "100", 10);

  try {
    const where: Record<string, unknown> = { familyId };

    if (memberDiscordId) {
      where.memberDiscordId = memberDiscordId;
    }

    if (status && ["OK", "WARN", "KO"].includes(status)) {
      where.status = status;
    }

    if (periodStartRaw) {
      const periodStart = new Date(periodStartRaw);
      if (!isNaN(periodStart.getTime())) {
        where.periodStart = { gte: periodStart };
      }
    }

    const snapshots = await prisma.activitySnapshot.findMany({
      where,
      orderBy: [{ periodEnd: "desc" }, { memberDiscordId: "asc" }],
      take: limit,
    });

    // Get member info
    const discordIds = [...new Set(snapshots.map((s) => s.memberDiscordId))];
    const members = await prisma.member.findMany({
      where: { familyId, discordId: { in: discordIds } },
      select: {
        discordId: true,
        rpName: true,
        grade: true,
        isActive: true,
        isGhost: true,
        rankRoleId: true,
        rankLabel: true,
        discordRoleIds: true,
      },
    });
    const scopedMembers = members
      .filter(isActiveMembersScopeMember)
      .map((member) => ({
        ...member,
        grade: getMemberScopeFlags(member).gradeInfo.grade,
      }));
    const allowedDiscordIds = new Set(
      scopedMembers
        .map((member) => member.discordId)
        .filter((discordId): discordId is string => typeof discordId === "string" && discordId.trim() !== "")
    );
    const memberMap = new Map(scopedMembers.map((m) => [m.discordId, m]));

    const enrichedSnapshots = snapshots
      .filter((snapshot) => allowedDiscordIds.has(snapshot.memberDiscordId))
      .map((s) => ({
        ...s,
        member: memberMap.get(s.memberDiscordId) ?? null,
      }));

    // Get summary stats
    const stats = {
      total: enrichedSnapshots.length,
      ok: enrichedSnapshots.filter((s) => s.status === "OK").length,
      warn: enrichedSnapshots.filter((s) => s.status === "WARN").length,
      ko: enrichedSnapshots.filter((s) => s.status === "KO").length,
    };

    return NextResponse.json({
      ok: true,
      snapshots: enrichedSnapshots,
      stats,
    });
  } catch (error: any) {
    console.error("[/api/staff/activity/snapshots GET]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to fetch snapshots" },
      { status: 500 }
    );
  }
}
