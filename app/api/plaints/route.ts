import { prisma } from '@/lib/db';
import { NextResponse } from 'next/server';

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

export async function GET() {
  return NextResponse.json({ error: 'Route désactivée' }, { status: 404 });
}

export async function POST(req: Request) {
  const body = await req.json();
  // ...existing validation...
  const complaint = await prisma.complaint.create({
    data: {
      familyId: "esperados",
      title: body.title,
      description: body.description ?? "",
      authorDiscordId: body.authorDiscordId,
      targetName: body.targetDiscordId ?? null,
      status: 'OPEN',
      createdById: body.createdById ?? "system",
    },
  });

  await enqueueOutbox('TICKET_CREATE', {
    ticketKind: 'COMPLAINT',
    ticketId: complaint.id,
    title: complaint.title,
    authorDiscordId: complaint.authorDiscordId,
    targetName: complaint.targetName,
    createdAt: new Date().toISOString(),
  }, complaint.id);

  return Response.json({ id: complaint.id });
}
