import { NextResponse } from "next/server";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { formatBanklogTime } from "@/lib/banklogs-formatter";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ discordId: string }> }
) {
  // ✅ PATCH: Unified staff protection
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  try {
    const { discordId } = await params;

    const member = await prisma.member.findUnique({
      where: {
        familyId_discordId: {
          familyId: "esperados",
          discordId,
        },
      },
      select: {
        id: true,
        rpName: true,
        discordId: true,
        steamId: true,
      },
    });

    if (!member) {
      return NextResponse.json(
        { ok: false, error: "Member not found" },
        { status: 404 }
      );
    }

    // Fetch audit logs related to this member
    const logs = await prisma.auditLog.findMany({
      where: {
        OR: [
          { entityId: member.id },
          { actorId: member.discordId },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        entityName: true,
        actorType: true,
        actorName: true,
        createdAt: true,
        meta: true,
      },
    });

    // Fetch sanctions
    const sanctions = await prisma.sanction.findMany({
      where: { memberId: member.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        type: true,
        status: true,
        reason: true,
        startAt: true,
        endAt: true,
        createdAt: true,
        createdBy: {
          select: { name: true },
        },
      },
    });

    // Fetch grade history
    const gradeHistory = await prisma.gradeHistory.findMany({
      where: { memberId: member.id },
      orderBy: { changedAt: "desc" },
      take: 50,
      select: {
        id: true,
        oldGrade: true,
        newGrade: true,
        source: true,
        changedAt: true,
      },
    });

    // Fetch banklogs for this member's steamId
    const banklogs = member.steamId ? await prisma.bankLog.findMany({
      where: { steamId: member.steamId },
      orderBy: { at: "desc" },
      take: 100,
      select: {
        id: true,
        steamId: true,
        type: true,
        money: true,
        at: true,
      },
    }) : [];

    return NextResponse.json({
      ok: true,
      data: {
        member,
        logs: logs.map((log) => ({
          ...log,
          createdAt: log.createdAt.toISOString(),
        })),
        sanctions: sanctions.map((s) => ({
          ...s,
          startAt: s.startAt.toISOString(),
          endAt: s.endAt?.toISOString() ?? null,
          createdAt: s.createdAt.toISOString(),
        })),
        gradeHistory: gradeHistory.map((g) => ({
          ...g,
          changedAt: g.changedAt.toISOString(),
        })),
        banklogs: banklogs.map((b) => ({
          id: b.id,
          steamId: b.steamId,
          type: b.type,
          money: b.money,
          at: b.at instanceof Date ? b.at.toISOString() : b.at,
          formattedAt: formatBanklogTime(b.at),
        })),
      },
    });
  } catch (error: any) {
    console.error("[GET /api/staff/members/by-discord/:discordId/history] Error:", error);
    return NextResponse.json(
      { ok: false, error: error.message || "Internal error" },
      { status: 500 }
    );
  }
}
