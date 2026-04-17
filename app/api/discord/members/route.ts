import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID } from "@/lib/family";
import {
  getDiscordGradeLevel,
  getDiscordGradeRoleId,
} from "@/lib/discord-grade";
import {
  getMemberScopeFlags,
  isActiveMembersScopeMember,
  isDisplayableStaffMember,
} from "@/lib/staff/member-scope";

const WORKER_SECRET = process.env.DISCORD_WORKER_SECRET;

function validateSecret(req: Request): boolean {
  if (!WORKER_SECRET) return false;
  const secret = req.headers.get("x-worker-secret");
  return secret === WORKER_SECRET;
}

/**
 * GET /api/discord/members
 * Returns list of active members for Discord role sync
 * Protected by x-worker-secret header
 */
export async function GET(req: NextRequest) {
  // Check secret is configured
  if (!WORKER_SECRET) {
    console.error("[/api/discord/members] DISCORD_WORKER_SECRET not configured");
    return NextResponse.json(
      { ok: false, error: "DISCORD_WORKER_SECRET not configured" },
      { status: 500 }
    );
  }

  // Validate secret header
  if (!validateSecret(req)) {
    console.warn(JSON.stringify({
      event: "discord_members_unauthorized",
      userAgent: req.headers.get("user-agent")?.slice(0, 100) ?? null,
      timestamp: new Date().toISOString(),
    }));
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const familyId = req.nextUrl.searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;
  const activeOnly = req.nextUrl.searchParams.get("activeOnly") !== "false";

  try {
    const where: Record<string, unknown> = { familyId };
    if (activeOnly) {
      where.isActive = true;
    }

    const members = await prisma.member.findMany({
      where,
      select: {
        discordId: true,
        grade: true,
        gradeLevel: true,
        roleDiscordId: true,
        isActive: true,
        isGhost: true,
        rpName: true,
        rankRoleId: true,
        rankLabel: true,
        discordRoleIds: true,
      },
    });

    const scopedMembers = members.filter(
      activeOnly ? isActiveMembersScopeMember : isDisplayableStaffMember
    );

    const validMembers = scopedMembers.filter((m) => m.discordId);

    return NextResponse.json({
      ok: true,
      members: validMembers.map((m) => ({
        discordId: m.discordId!,
        grade: getMemberScopeFlags(m).gradeInfo.grade ?? m.grade,
        gradeLevel: getDiscordGradeLevel(m.discordRoleIds) ?? m.gradeLevel,
        roleDiscordId: getDiscordGradeRoleId(m.discordRoleIds) ?? m.roleDiscordId,
        isActive: m.isActive,
        rpName: m.rpName,
      })),
      count: validMembers.length,
    });
  } catch (err) {
    console.error("[/api/discord/members] Error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
