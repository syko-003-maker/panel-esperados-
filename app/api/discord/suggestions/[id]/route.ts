import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkWorkerAuth } from "@/lib/suggestions-discord";

/**
 * PATCH /api/discord/suggestions/[id] — enregistre l'ID du message/salon Discord
 * de l'embed (pour que le reconciler puisse l'éditer). Auth worker.
 */

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkWorkerAuth(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);

  const data: { discordMessageId?: string | null; discordChannelId?: string | null } = {};
  if (body?.discordMessageId !== undefined)
    data.discordMessageId = body.discordMessageId ? String(body.discordMessageId) : null;
  if (body?.discordChannelId !== undefined)
    data.discordChannelId = body.discordChannelId ? String(body.discordChannelId) : null;
  if (Object.keys(data).length === 0)
    return NextResponse.json({ ok: false, error: "RIEN_A_METTRE_A_JOUR" }, { status: 400 });

  try {
    await prisma.suggestion.update({ where: { id }, data });
  } catch (err) {
    // Sans cet enregistrement, le reconciler ne pourra plus editer l'embed :
    // annoncer un succes serait mensonger.
    const code = (err as { code?: string })?.code;
    console.error("[discord/suggestions] mise a jour echouee", { id, code });
    if (code === "P2025") {
      return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: "UPDATE_FAILED" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
