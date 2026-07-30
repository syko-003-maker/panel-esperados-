import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * Archivage des messages d'un ticket de recrutement.
 *
 * Le worker appelle cette route au moment de la décision, avant que le fil ne
 * soit verrouillé puis archivé — et éventuellement supprimé. Sans cette copie,
 * la conversation qui justifie la décision disparaît : ni le site ni
 * l'explication envoyée au candidat ne peuvent s'y appuyer.
 *
 * Miroir de /api/ingest/complaint/messages-archive, même contrat d'auth.
 */

const INGEST_SECRET = process.env.DISCORD_INGEST_SECRET ?? process.env.INGEST_SECRET;

function isAuthorized(req: Request): boolean {
  return Boolean(INGEST_SECRET) && req.headers.get("x-ingest-secret") === INGEST_SECRET;
}

type ArchivedMessageInput = {
  discordMessageId?: string;
  authorDiscordId?: string;
  authorNameSnapshot?: string;
  authorIsBot?: boolean;
  content?: string;
  embedsText?: string;
  attachmentsJson?: unknown;
  createdAtDiscord?: string;
  editedAtDiscord?: string;
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
  const channelId = body && typeof body.channelId === "string" ? body.channelId.trim() : "";
  const messages = Array.isArray(body?.messages) ? (body.messages as ArchivedMessageInput[]) : null;

  if ((!ticketKey && !channelId) || !messages) {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  // Deux appelants : l'archivage à la décision connaît la clé du ticket, celui
  // au fil de l'eau ne connaît que le salon d'où vient le message.
  const recruitment = ticketKey
    ? await prisma.recruitment.findUnique({ where: { ticketKey }, select: { id: true } })
    : await prisma.recruitment.findFirst({
        where: { discordThreadId: channelId },
        select: { id: true },
      });

  if (!recruitment) {
    // Salon sans fiche liée : l'appelant au fil de l'eau ne peut pas le savoir
    // à l'avance, ce n'est donc pas une anomalie de son côté.
    return NextResponse.json({ ok: false, error: "Recruitment not found" }, { status: 404 });
  }

  let stored = 0;
  let skipped = 0;

  for (const msg of messages) {
    const discordMessageId = typeof msg.discordMessageId === "string" ? msg.discordMessageId.trim() : "";
    if (!discordMessageId) {
      skipped += 1;
      continue;
    }

    const data = {
      recruitmentId: recruitment.id,
      authorDiscordId: msg.authorDiscordId?.trim() || "unknown",
      authorNameSnapshot: msg.authorNameSnapshot?.trim() || "Unknown",
      authorIsBot: Boolean(msg.authorIsBot),
      content: typeof msg.content === "string" ? msg.content : "",
      embedsText: typeof msg.embedsText === "string" && msg.embedsText.trim() ? msg.embedsText : null,
      attachmentsJson: (msg.attachmentsJson ?? null) as never,
      createdAtDiscord: toDateOrNull(msg.createdAtDiscord) ?? new Date(),
      editedAtDiscord: toDateOrNull(msg.editedAtDiscord),
    };

    // Upsert : le worker peut réessayer un job, et une décision peut être
    // rejouée. On veut alors rafraîchir la copie, pas empiler des doublons.
    await prisma.recruitmentMessage.upsert({
      where: { discordMessageId },
      create: { discordMessageId, ...data },
      update: data,
    });
    stored += 1;
  }

  return NextResponse.json({ ok: true, ticketKey, stored, skipped });
}
