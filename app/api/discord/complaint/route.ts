import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { randomUUID } from "crypto";

const TICKET_PARENT_CHANNEL = process.env.DISCORD_TICKETS_CATEGORY_ID || null;
const discordIdRegex = /^[0-9]{17,20}$/;

function makeDebugId(): string {
  return randomUUID();
}

function makeTicketKey(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function badRequest(message: string, details?: any) {
  return NextResponse.json(
    { ok: false, error: "validation_error", message, details },
    { status: 400 }
  );
}

export async function POST(req: Request) {
  const debugId = makeDebugId();
  let payload: any = null;

  try {
    const body = await req.json().catch(() => null);
    if (!body) return badRequest("Invalid JSON");

    payload = {
      title: String(body.title || "").trim(),
      description: String(body.description || "").trim(),
      targetDiscordId:
        body.targetDiscordId === null || body.targetDiscordId === undefined
          ? null
          : String(body.targetDiscordId || "").trim(),
      authorDiscordId: String(body.authorDiscordId || "").trim(),
      ticketChannelId: String(body.ticketChannelId || "").trim(),
    };

    if (payload.title.length < 3) return badRequest("title too short");
    if (payload.description.length < 10) return badRequest("description too short");
    if (!payload.authorDiscordId) return badRequest("authorDiscordId required");
    if (payload.targetDiscordId && !discordIdRegex.test(payload.targetDiscordId))
      return badRequest("targetDiscordId invalid");
    if (!payload.ticketChannelId) return badRequest("ticketChannelId required");

    const ticketKey = makeTicketKey("pl");
    const userId = `discord:${payload.authorDiscordId}`;

    const complaint = await prisma.complaint.create({
      data: {
        ticketKey,
        status: "OPEN",
        title: payload.title,
        description: payload.description,
        targetName: payload.targetDiscordId, // Store as targetName
        familyId: "esperados",
        authorDiscordId: payload.authorDiscordId,
        ticketChannelId: payload.ticketChannelId,

        createdBy: {
          connectOrCreate: {
            where: { id: userId },
            create: {
              id: userId,
              name: `Discord ${payload.authorDiscordId}`,
            },
          },
        },
      },
      select: { id: true, ticketKey: true },
    });

    console.log("[api/discord/complaint] created", {
      id: complaint.id,
      ticketKey: complaint.ticketKey,
    });

    await prisma.discordOutbox.create({
      data: {
        familyId: "esperados",
        type: "SANCTION_NOTIFY",
        status: "PENDING",
        attempt: 0,
        maxAttempts: 10,
        channelId: TICKET_PARENT_CHANNEL,
        entityId: complaint.id,
        nextAttemptAt: new Date(),
        meta: {
          kind: "TICKET_CREATE",
          ticketKind: "COMPLAINT",
          ticketId: complaint.id,
          title: payload.title,
          description: payload.description,
          targetDiscordId: payload.targetDiscordId,
          authorDiscordId: payload.authorDiscordId,
          ticketChannelId: payload.ticketChannelId,
        },
      },
    });

    return NextResponse.json(
      { ok: true, complaintId: complaint.id, ticketKey: complaint.ticketKey },
      { status: 200 }
    );
  } catch (err: any) {
    console.error(`[api/discord/complaint] debugId=${debugId}`, err);
    console.error("payload:", payload);
    return NextResponse.json({ ok: false, error: "internal_error", debugId }, { status: 500 });
  }
}
