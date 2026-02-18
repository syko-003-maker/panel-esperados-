import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { DEFAULT_FAMILY_ID } from "@/lib/family";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ discordId: string }> }
) {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const { discordId } = await params;
  if (!discordId) {
    return NextResponse.json({ ok: false, error: "MISSING_DISCORD_ID" }, { status: 400 });
  }

  const familyId = DEFAULT_FAMILY_ID;

  try {
    // Find member by discordId
    const member = await prisma.member.findUnique({
      where: { familyId_discordId: { familyId, discordId } },
      select: { id: true, rpName: true, discordId: true },
    });

    if (!member) {
      return NextResponse.json({ ok: false, error: "MEMBER_NOT_FOUND" }, { status: 404 });
    }

    // Get all sanctions for this member
    const sanctions = (await prisma.sanction.findMany({
      where: { memberId: member.id, familyId },
      orderBy: { createdAt: "desc" },
    })) as any[];

    // Get audit logs related to this member's sanctions
    const sanctionIds = sanctions.map((s) => s.id);
    const auditLogs =
      sanctionIds.length > 0
        ? await prisma.auditLog.findMany({
            where: {
              entityId: { in: sanctionIds },
              entity: "Sanction",
            },
            orderBy: { createdAt: "desc" },
          })
        : [];

    const auditByEntityId = new Map<string, any[]>();
    for (const log of auditLogs) {
      if (!auditByEntityId.has(log.entityId)) {
        auditByEntityId.set(log.entityId, []);
      }
      auditByEntityId.get(log.entityId)!.push(log);
    }

    // Get staff info for createdBy references
    const staffIds = Array.from(new Set(sanctions.map((s) => s.createdById).filter(Boolean)));
    const staffMap = new Map<string, any>();
    if (staffIds.length > 0) {
      const staffUsers = await prisma.user.findMany({
        where: { id: { in: staffIds as string[] } },
        select: { id: true, name: true },
      });
      for (const staff of staffUsers) {
        staffMap.set(staff.id, staff);
      }
    }

    // Build timeline
    const timeline = sanctions.map((sanction) => ({
      id: sanction.id,
      type: sanction.type,
      reason: sanction.reason,
      status: sanction.status,
      discordStatus: sanction.discordStatus,
      discordError: sanction.discordError,
      createdAt: sanction.createdAt.toISOString(),
      createdBy: sanction.createdById ? staffMap.get(sanction.createdById)?.name : null,
      startAt: sanction.startAt.toISOString(),
      expiresAt: sanction.expiresAt?.toISOString() ?? null,
      clearedAt: sanction.clearedAt?.toISOString() ?? null,
      clearedStatus: sanction.clearedStatus ?? null,
      clearedError: sanction.clearedError ?? null,
      auditEvents: (auditByEntityId.get(sanction.id) ?? [])
        .map((log) => ({
          action: log.action,
          createdAt: log.createdAt.toISOString(),
        }))
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        ),
    }));

    return NextResponse.json({
      ok: true,
      member: { id: member.id, rpName: member.rpName, discordId: member.discordId },
      sanctions: timeline,
      total: timeline.length,
    });
  } catch (e: any) {
    const errMsg = e?.message ?? String(e);
    console.error("[/api/staff/members/by-discord/[discordId]/sanctions GET] error:", errMsg);
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
