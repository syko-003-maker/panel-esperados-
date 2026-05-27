import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireFullWriter } from "@/lib/guards";
import { BLACKLIST_ROLE_ID } from "@/lib/discord-grade";

/**
 * POST /api/staff/sanctions/[id]/force-applied
 * Force discordStatus to APPLIED without going through Discord.
 * Used when the member is banned/left the server and the role can never be applied.
 * For BLACKLIST sanctions, also updates the member record so they appear as blacklisted in the UI.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Action sensible : forcer APPLIED. Bloqué pour Encadrant.
  const guard = await requireFullWriter();
  if (guard instanceof Response) return guard;

  const sanction = await prisma.sanction.findUnique({
    where: { id },
    select: {
      id: true,
      type: true,
      discordStatus: true,
      memberId: true,
      discordId: true,
      member: { select: { id: true, discordRoleIds: true } },
    },
  });

  if (!sanction) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  if (sanction.discordStatus === "APPLIED") {
    return NextResponse.json({ ok: false, error: "ALREADY_APPLIED" }, { status: 409 });
  }

  // Cancel any pending outbox job for this sanction so the worker doesn't overwrite our status
  await prisma.discordOutbox.updateMany({
    where: {
      dedupeKey: `SANCTION_APPLY:${id}`,
      status: { in: ["PENDING", "RUNNING"] },
    },
    data: { status: "FAILED", lastError: "Cancelled — force-applied by staff" },
  });

  await prisma.sanction.update({
    where: { id },
    data: {
      discordStatus: "APPLIED",
      discordError: null,
    } as any,
  });

  // For BLACKLIST: update the member record so they show up as blacklisted in the members list.
  // Since the Discord role was never actually applied (member left/banned), we inject the role ID
  // manually and set the grade so all existing detection logic recognises them as blacklisted.
  if (sanction.type === "BLACKLIST" && sanction.member?.id) {
    const currentRoles: string[] = Array.isArray(sanction.member.discordRoleIds)
      ? (sanction.member.discordRoleIds as string[])
      : [];

    const updatedRoles = currentRoles.includes(BLACKLIST_ROLE_ID)
      ? currentRoles
      : [...currentRoles, BLACKLIST_ROLE_ID];

    await (prisma.member as any).update({
      where: { id: sanction.member.id },
      data: {
        discordRoleIds: updatedRoles,
        grade: "Blacklist",
        rankLabel: "Blacklist",
        discordInGuild: false,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
