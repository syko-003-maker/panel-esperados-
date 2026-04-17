import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { randomUUID } from "crypto";
import { buildRecruitmentStorage } from "@/lib/recruitment/ingest";

const TICKET_PARENT_CHANNEL = process.env.DISCORD_TICKETS_CATEGORY_ID || null;

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

    const storage = buildRecruitmentStorage(body);

    payload = {
      rpName: String(body.rpName || "").trim(),
      steamId: String(body.steamId || "").trim(),
      age: Number(body.age),
      activeSanctions: Number(body.activeSanctions),
      authorDiscordId: String(body.authorDiscordId || "").trim(),
      ticketChannelId: String(body.ticketChannelId || "").trim(),
    };

    if (payload.rpName.length < 3) return badRequest("rpName too short");
    if (!payload.steamId || payload.steamId.length < 10) return badRequest("steamId invalid");
    if (!Number.isInteger(payload.age) || payload.age < 16) return badRequest("age invalid");
    if (!Number.isInteger(payload.activeSanctions) || payload.activeSanctions < 0)
      return badRequest("activeSanctions invalid");
    if (!payload.authorDiscordId) return badRequest("authorDiscordId required");
    if (!payload.ticketChannelId) return badRequest("ticketChannelId required");

    const ticketKey = makeTicketKey("rec");
    const userId = `discord:${payload.authorDiscordId}`;

    const recruitment = await prisma.recruitment.create({
      data: {
        ticketKey,
        status: "PENDING",
        rpName: payload.rpName,
        familyId: "esperados",
        discordId: payload.authorDiscordId,
        ticketChannelId: payload.ticketChannelId,
        payload: storage.payload as any,
        notes: storage.notes,
        age: payload.age,
        steamId: payload.steamId,
        motivation: (storage.motivation ?? String(body.motivation || "").trim()) || null,
        availabilities: (storage.availabilities ?? String(body.dispo || body.availabilities || "").trim()) || null,

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

    console.log("[api/discord/recruitment] created", {
      id: recruitment.id,
      ticketKey: recruitment.ticketKey,
    });

    await prisma.discordOutbox.create({
      data: {
        familyId: "esperados",
        type: "SANCTION_NOTIFY",
        status: "PENDING",
        attempt: 0,
        maxAttempts: 10,
        channelId: TICKET_PARENT_CHANNEL,
        entityId: recruitment.id,
        nextAttemptAt: new Date(),
        meta: {
          kind: "TICKET_CREATE",
          ticketKind: "RECRUITMENT",
          ticketId: recruitment.id,
          rpName: payload.rpName,
          steamId: payload.steamId,
          age: payload.age,
          activeSanctions: payload.activeSanctions,
          payload: storage.payload,
          discordId: payload.authorDiscordId,
          authorDiscordId: payload.authorDiscordId,
          ticketChannelId: payload.ticketChannelId,
          // NO whitelist info here - only ticket creation
        },
      },
    });

    console.log("[api/discord/recruitment] created (whitelist NOT queued yet)", {
      id: recruitment.id,
      ticketKey: recruitment.ticketKey,
    });

    return NextResponse.json(
      { ok: true, recruitmentId: recruitment.id, ticketKey: recruitment.ticketKey },
      { status: 200 }
    );
  } catch (err: any) {
    console.error(`[api/discord/recruitment] debugId=${debugId}`, err);
    console.error("payload:", payload);
    return NextResponse.json({ ok: false, error: "internal_error", debugId }, { status: 500 });
  }
}
