import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePrivileged } from "@/lib/guards";

function parseAfter(value: string | null) {
  if (!value) return null;
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) {
    const d = new Date(asNumber);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const after = parseAfter(searchParams.get("after"));

  const where: Record<string, unknown> = { ticketId: id };
  if (after) {
    where.OR = [
      { createdAtDiscord: { gt: after } },
      { editedAtDiscord: { gt: after } },
      { deletedAtDiscord: { gt: after } },
    ];
  }

  const data = await prisma.complaintMessage.findMany({
    where,
    orderBy: { createdAtDiscord: "asc" },
    select: {
      discordMessageId: true,
      authorNameSnapshot: true,
      authorDiscordId: true,
      content: true,
      attachmentsJson: true,
      createdAtDiscord: true,
      editedAtDiscord: true,
      deletedAtDiscord: true,
    },
  });

  return NextResponse.json({ ok: true, data });
}
