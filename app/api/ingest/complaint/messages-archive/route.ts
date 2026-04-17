import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const INGEST_SECRET = process.env.DISCORD_INGEST_SECRET ?? process.env.INGEST_SECRET;

function isAuthorized(req: Request): boolean {
  return Boolean(INGEST_SECRET) && req.headers.get("x-ingest-secret") === INGEST_SECRET;
}

type ArchivedMessageInput = {
  discordMessageId?: string;
  authorDiscordId?: string;
  authorNameSnapshot?: string;
  content?: string;
  attachmentsJson?: unknown;
  createdAtDiscord?: string;
  editedAtDiscord?: string;
  deletedAtDiscord?: string;
};

function toDateOrNull(value: unknown): Date | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const ticketKey = body && typeof body.ticketKey === "string" ? body.ticketKey.trim() : "";
  const messages = Array.isArray(body?.messages) ? (body.messages as ArchivedMessageInput[]) : null;

  if (!ticketKey || !messages) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const complaint = await prisma.complaint.findUnique({
    where: { ticketKey },
    select: { id: true, discordThreadId: true },
  });

  if (!complaint) {
    return NextResponse.json({ ok: false, error: "Complaint not found" }, { status: 404 });
  }

  const channelId = complaint.discordThreadId;
  if (!channelId) {
    return NextResponse.json({ ok: false, error: "Complaint channel missing" }, { status: 400 });
  }

  const ticket = await prisma.complaintTicket.upsert({
    where: { complaintId: complaint.id },
    create: {
      guildId: process.env.GUILD_ID ?? "unknown",
      channelId,
      threadId: channelId,
      categoryId: process.env.TICKETS_PARENT_CHANNEL_ID ?? "unknown",
      complaintId: complaint.id,
    },
    update: {
      channelId,
      threadId: channelId,
    },
    select: { id: true },
  });

  for (const message of messages) {
    if (!message.discordMessageId) continue;
    const createdAtDiscord = toDateOrNull(message.createdAtDiscord) ?? new Date();

    await prisma.complaintMessage.upsert({
      where: { discordMessageId: message.discordMessageId },
      create: {
        ticketId: ticket.id,
        discordMessageId: message.discordMessageId,
        authorDiscordId: message.authorDiscordId || "unknown",
        authorNameSnapshot: message.authorNameSnapshot || "Unknown",
        content: message.content || "",
        attachmentsJson: (message.attachmentsJson as any) ?? undefined,
        createdAtDiscord,
        editedAtDiscord: toDateOrNull(message.editedAtDiscord) ?? undefined,
        deletedAtDiscord: toDateOrNull(message.deletedAtDiscord) ?? undefined,
      },
      update: {
        authorDiscordId: message.authorDiscordId || "unknown",
        authorNameSnapshot: message.authorNameSnapshot || "Unknown",
        content: message.content || "",
        attachmentsJson: (message.attachmentsJson as any) ?? undefined,
        createdAtDiscord,
        editedAtDiscord: toDateOrNull(message.editedAtDiscord) ?? undefined,
        deletedAtDiscord: toDateOrNull(message.deletedAtDiscord) ?? undefined,
      },
    });
  }

  return NextResponse.json({ ok: true, archived: messages.length });
}