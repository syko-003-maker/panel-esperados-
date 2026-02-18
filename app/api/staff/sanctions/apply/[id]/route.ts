import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { getSession } from "@/auth";
import { enqueueSanctionApply } from "@/lib/discord/discord";

const FAMILY_ID = process.env.FAMILY_ID ?? "esperados";

/**
 * POST /api/staff/sanctions/apply/[id]
 * Staff endpoint to apply a sanction to Discord (remove roles, mute, etc)
 *
 * CRITICAL RULE: Only ChefOrEtatMajor can apply sanctions to Discord
 * This queues the action asynchronously via Outbox pattern
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const session = await getSession();
  const userId = session?.user?.id ?? (session as any)?.userId;
  if (!userId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const sanction = await prisma.sanction.findUnique({
    where: { id },
    include: {
      member: { select: { discordId: true, rpName: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  if (!sanction) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  if (sanction.discordStatus === "APPLIED") {
    return NextResponse.json({ ok: false, error: "ALREADY_APPLIED" }, { status: 409 });
  }

  const memberDiscordId = sanction.member?.discordId;
  if (!memberDiscordId) {
    return NextResponse.json(
      { ok: false, error: "MEMBER_NOT_LINKED", message: "Member has no Discord ID" },
      { status: 400 }
    );
  }

  // Queue the Discord action
  await enqueueSanctionApply({
    familyId: FAMILY_ID,
    sanctionId: sanction.id,
    discordId: memberDiscordId,
    memberName: sanction.member?.rpName ?? "Unknown",
    sanctionType: sanction.type,
    reason: sanction.reason ?? "No reason provided",
    durationHours: sanction.endAt
      ? Math.max(1, Math.ceil((sanction.endAt.getTime() - Date.now()) / (60 * 60 * 1000)))
      : null,
    staffName: sanction.createdBy?.name ?? "Unknown",
    appliedByUserId: userId,
  });

  // Mark as pending (worker will apply)
  await prisma.sanction.update({
    where: { id },
    data: {
      discordStatus: "PENDING",
    },
  });

  return NextResponse.json({
    ok: true,
    message: "Sanction queued for Discord application",
    sanction: {
      id: sanction.id,
      type: sanction.type,
      status: sanction.status,
      discordStatus: "PENDING",
      memberDiscordId,
    },
  });
}
