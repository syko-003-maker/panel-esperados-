import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveDiscordId } from "../_scope";

export async function POST(req: NextRequest) {
  const discordId = await resolveDiscordId();
  if (!discordId) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const sub = (body as any)?.subscription;
  const endpoint = sub?.endpoint;
  const p256dh = sub?.keys?.p256dh;
  const authKey = sub?.keys?.auth;
  if (!endpoint || !p256dh || !authKey) {
    return NextResponse.json({ ok: false, error: "INVALID_SUBSCRIPTION" }, { status: 400 });
  }

  const userAgent = req.headers.get("user-agent")?.slice(0, 200) ?? null;
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { discordId, endpoint, p256dh, auth: authKey, userAgent },
    update: { discordId, p256dh, auth: authKey, userAgent, lastSeenAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const discordId = await resolveDiscordId();
  if (!discordId) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const endpoint = (body as any)?.endpoint;
  if (endpoint) await prisma.pushSubscription.deleteMany({ where: { endpoint, discordId } });
  return NextResponse.json({ ok: true });
}
