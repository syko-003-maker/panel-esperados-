import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireFullWriter } from "@/lib/guards";
import { auditStaffAction, createAuditLog } from "@/lib/audit";
import { enqueueRemoveRole } from "@/lib/discord/discord";
import { getSanctionClearRoleId, isClearableSanctionType } from "@/lib/sanctions";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Action sensible : clear sanction. Bloqué pour Encadrant.
  const guard = await requireFullWriter();
  if (guard instanceof Response) return guard;

  const actorId = (guard.session as any)?.user?.id ?? (guard.session as any)?.userId;
  const actorName = (guard.session as any)?.user?.name ?? null;
  if (!actorId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "MISSING_ID" }, { status: 400 });
  }

  try {
    const sanction = await prisma.sanction.findUnique({
      where: { id },
      include: { member: { select: { discordId: true, rpName: true } } },
    }) as any;

    if (!sanction) {
      return NextResponse.json({ ok: false, error: "SANCTION_NOT_FOUND" }, { status: 404 });
    }

    if (!isClearableSanctionType(sanction.type)) {
      return NextResponse.json(
        { ok: false, error: "SANCTION_TYPE_NOT_CLEARABLE" },
        { status: 400 }
      );
    }

    // Cannot clear if already cleared
    if (sanction.clearedAt) {
      return NextResponse.json(
        { ok: false, error: "ALREADY_CLEARED" },
        { status: 400 }
      );
    }

    const guildId = process.env.DISCORD_GUILD_ID ?? process.env.GUILD_ID ?? "";
    const roleId = getSanctionClearRoleId(sanction.type);
    const targetDiscordId = sanction.member?.discordId ?? sanction.discordId ?? null;

    if (!guildId || !roleId || !targetDiscordId) {
      return NextResponse.json({ ok: false, error: "SANCTION_CLEAR_NOT_READY" }, { status: 409 });
    }

    const outbox = await enqueueRemoveRole({
      familyId: sanction.familyId,
      guildId,
      userDiscordId: targetDiscordId,
      roleId,
      entity: "Sanction",
      entityId: sanction.id,
      meta: {
        sanctionId: sanction.id,
        sanctionType: sanction.type,
        memberId: sanction.memberId,
        memberDiscordId: targetDiscordId,
        memberName: sanction.member?.rpName ?? null,
        requestedByUserId: actorId,
        setClearedAt: true,
      },
    });

    const clearedNow = new Date();
    await prisma.sanction.update({
      where: { id: sanction.id },
      data: {
        clearedAt: clearedNow,
        clearedStatus: "PENDING",
        clearedError: null,
        outboxJobId: outbox.id,
      } as any,
    });

    // Audit trail
    const memberName = sanction.member?.rpName ?? "Unknown";
    await auditStaffAction(actorId, actorName, "SANCTION_CLEARED_MANUAL", "Sanction", sanction.id, {
      entityName: memberName,
      meta: {
        memberId: sanction.memberId,
        type: sanction.type,
        outboxJobId: outbox.id,
      },
    });

    await createAuditLog({
      actorType: "staff",
      actorId,
      action: "SANCTION_CLEARED_MANUAL",
      entity: "Sanction",
      entityId: sanction.id,
      meta: {
        actorName,
        type: sanction.type,
        memberDiscordId: sanction.member?.discordId,
        outboxJobId: outbox.id,
      },
    });

    return NextResponse.json({
      ok: true,
      sanction: {
        id: sanction.id,
        clearedAt: clearedNow.toISOString(),
        clearedStatus: "PENDING",
        outboxJobId: outbox.id,
      },
    });
  } catch (e: any) {
    const errMsg = e?.message ?? String(e);
    console.error("[/api/staff/sanctions/[id]/clear POST] error:", errMsg);
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
