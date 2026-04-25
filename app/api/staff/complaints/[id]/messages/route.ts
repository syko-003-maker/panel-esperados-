import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChefOrEtatMajor } from "@/lib/guards";

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
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const complaintTicket = await prisma.complaintTicket.findUnique({
    where: { complaintId: id },
    select: { id: true },
  });

  if (!complaintTicket) {
    return NextResponse.json({ ok: true, data: [] });
  }

  const { searchParams } = new URL(req.url);
  const after = parseAfter(searchParams.get("after"));

  const where: Record<string, unknown> = { ticketId: complaintTicket.id };
  if (after) {
    where.OR = [
      { createdAtDiscord: { gt: after } },
      { editedAtDiscord: { gt: after } },
      { deletedAtDiscord: { gt: after } },
    ];
  }

  const messages = await prisma.complaintMessage.findMany({
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

  // Resolve RP names for authors that are in the Member table
  const discordIds = [...new Set(messages.map((m) => m.authorDiscordId).filter(Boolean))] as string[];
  const members = discordIds.length > 0
    ? await prisma.member.findMany({
        where: { discordId: { in: discordIds } },
        select: { discordId: true, rpName: true },
      })
    : [];
  const rpNameByDiscordId = new Map(members.map((m) => [m.discordId, m.rpName]));

  const data = messages.map((m) => ({
    ...m,
    authorRpName: m.authorDiscordId ? (rpNameByDiscordId.get(m.authorDiscordId) ?? null) : null,
  }));

  return NextResponse.json({ ok: true, data });
}
