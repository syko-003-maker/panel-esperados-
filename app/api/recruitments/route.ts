import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';
import { buildRecruitmentStorage } from '@/lib/recruitment/ingest';

const PARENT_CHANNEL_ID = process.env.DISCORD_TICKET_PARENT_CHANNEL_ID;

async function enqueueOutbox(kind: 'TICKET_CREATE' | 'TICKET_SYNC' | 'TICKET_DECISION', meta: any, entityId: string) {
  await prisma.discordOutbox.create({
    data: {
      familyId: 'esperados',
      type: 'SANCTION_NOTIFY',
      status: 'PENDING',
      attempt: 0,
      maxAttempts: 10,
      nextAttemptAt: new Date(0),
      channelId: PARENT_CHANNEL_ID ?? null,
      entityId,
      meta: { kind, ...meta },
    },
  });
}

async function getDiscordChannelId(type: 'PLAINT' | 'RECRUITMENT') {
  const config = await prisma.discordConfig.findFirst();
  if (config) {
    return type === 'PLAINT' ? config.complaintsChannelId : config.recruitmentChannelId;
  }
  if (type === 'PLAINT') return process.env.DISCORD_PLAINTS_CHANNEL_ID;
  return process.env.DISCORD_RECRUITMENT_CHANNEL_ID;
}

export async function GET() {
  return NextResponse.json({ error: 'Route désactivée' }, { status: 404 });
}

export async function POST(req: Request) {
  const body = await req.json();
  const storage = buildRecruitmentStorage(body ?? {});

  const recruitment = await prisma.recruitment.create({
    data: {
      familyId: "esperados",
      discordId: body.discordId,
      rpName: body.rpName,
      steamId: body.steamId ?? null,
      age: typeof body.age === 'number' ? body.age : null,
      payload: storage.payload as any,
      notes: storage.notes,
      motivation: storage.motivation,
      availabilities: storage.availabilities,
      status: 'PENDING',
      createdById: body.createdById ?? "system",
    },
  });

  await enqueueOutbox('TICKET_CREATE', {
    ticketKind: 'RECRUITMENT',
    ticketId: recruitment.id,
    rpName: recruitment.rpName,
    discordId: recruitment.discordId,
    steamId: recruitment.steamId,
    payload: storage.payload,
    createdAt: new Date().toISOString(),
  }, recruitment.id);

  return Response.json({ id: recruitment.id });
}
