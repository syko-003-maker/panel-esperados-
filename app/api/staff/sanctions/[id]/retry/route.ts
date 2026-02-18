import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { auditStaffAction } from "@/lib/audit";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const session = (guard as any).session;
  const actorId = session?.user?.id ?? session?.userId;
  const actorName = session?.user?.name ?? null;
  if (!actorId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const sanction = await prisma.sanction.findUnique({
    where: { id },
    select: { 
      id: true, 
      familyId: true, 
      discordId: true, 
      discordStatus: true,
      type: true,
      reason: true,
      member: { select: { id: true, discordId: true, rpName: true } }
    },
  });

  if (!sanction) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  if (sanction.discordStatus === "APPLIED") {
    return NextResponse.json({ ok: false, error: "ALREADY_APPLIED" }, { status: 400 });
  }

  const logChannelId = process.env.SANCTION_LOG_CHANNEL_ID;
  if (!logChannelId) {
    return NextResponse.json({ ok: false, error: "SANCTION_LOG_CHANNEL_ID not configured" }, { status: 500 });
  }

  await prisma.sanction.update({
    where: { id },
    data: {
      discordStatus: "PENDING",
      discordError: null,
    } as any,
  });

  const targetDiscordId = sanction.member?.discordId ?? sanction.discordId;
  const outbox = await prisma.discordOutbox.create({
    data: {
      familyId: sanction.familyId,
      type: "SANCTION_APPLY",
      status: "PENDING",
      channelId: logChannelId,
      userDiscordId: targetDiscordId,
      entity: "Sanction",
      entityId: sanction.id,
      meta: {
        forceRetry: true,
        sanctionId: sanction.id,
        memberId: sanction.member?.id ?? null,
        memberDiscordId: targetDiscordId,
        memberName: sanction.member?.rpName ?? null,
        type: sanction.type,
        reason: sanction.reason,
      },
    } as any,
  });

  await auditStaffAction(actorId, actorName, "SANCTION_RETRY", "Sanction", sanction.id, {
    familyId: sanction.familyId,
    entityName: sanction.member?.rpName ?? undefined,
    meta: { outboxJobId: outbox.id },
  });

  return NextResponse.json({
    ok: true,
    sanction: {
      id: sanction.id,
      discordStatus: "PENDING",
      outboxJobId: outbox.id,
    },
  });
}
