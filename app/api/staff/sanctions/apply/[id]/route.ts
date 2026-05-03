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
  const actorMemberId = (session as any)?.member?.id ?? null;
  if (!userId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const actorRpName = actorMemberId
    ? (
        await prisma.member.findFirst({
          where: { id: actorMemberId, familyId: FAMILY_ID },
          select: { rpName: true },
        })
      )?.rpName ?? null
    : null;

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

  if (sanction.discordStatus === "PENDING") {
    return NextResponse.json({ ok: false, error: "ALREADY_QUEUED" }, { status: 409 });
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

  const expiresAt = sanction.expiresAt ?? sanction.endAt;

  // Reset any existing FAILED outbox job so it can be requeued.
  // enqueueSanctionApply uses a dedupeKey (unique constraint), so if a FAILED job
  // already exists with that key the INSERT would be silently dropped — leaving the
  // sanction stuck in PENDING forever. Resetting it to PENDING first lets the worker
  // pick it up again without needing to create a new row.
  const dedupeKey = `SANCTION_APPLY:${sanction.id}`;
  const resetCount = await prisma.discordOutbox.updateMany({
    where: { dedupeKey, status: { in: ["FAILED", "SENT"] } },
    data: { status: "PENDING", nextAttemptAt: new Date(), lastError: null, attempt: 0 },
  });

  // Only enqueue a brand-new job when no existing job was reset
  if (resetCount.count === 0) {
    await enqueueSanctionApply({
      familyId: FAMILY_ID,
      sanctionId: sanction.id,
      discordId: memberDiscordId,
      memberName: sanction.member?.rpName ?? "Unknown",
      sanctionType: sanction.type,
      reason: sanction.reason ?? "No reason provided",
      durationHours: expiresAt
        ? Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / (60 * 60 * 1000)))
        : null,
      staffName: sanction.createdBy?.name ?? "Unknown",
      staffRpName: actorRpName,
      appliedByUserId: userId,
      actorMemberId,
    });
  }

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
