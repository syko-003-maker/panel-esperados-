import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID } from "@/lib/family";

const WORKER_SECRET = process.env.DISCORD_WORKER_SECRET ?? process.env.INGEST_SECRET;

/**
 * GET /api/discord/ticket?ticketKey=...
 * Worker-only endpoint to lookup ticket info
 */
export async function GET(req: NextRequest) {
  // Validate worker secret
  const authHeader = req.headers.get("authorization");
  const providedSecret = authHeader?.replace("Bearer ", "");

  if (!WORKER_SECRET || providedSecret !== WORKER_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const ticketKey = req.nextUrl.searchParams.get("ticketKey");
  const familyId = req.nextUrl.searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;

  if (!ticketKey) {
    return NextResponse.json({ ok: false, error: "ticketKey required" }, { status: 400 });
  }

  try {
    // Check recruitment
    const recruitment = await prisma.recruitment.findFirst({
      where: { familyId, ticketKey },
      select: {
        id: true,
        ticketKey: true,
        status: true,
        rpName: true,
        discordId: true,
        steamId: true,
        discordThreadId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (recruitment) {
      const panelBaseUrl = process.env.NEXTAUTH_URL ?? process.env.PANEL_BASE_URL ?? "";
      const panelUrl = panelBaseUrl ? `${panelBaseUrl}/staff/recruitment/${recruitment.id}` : null;

      return NextResponse.json({
        ok: true,
        ticket: {
          type: "RECRUITMENT",
          id: recruitment.id,
          ticketKey: recruitment.ticketKey,
          status: recruitment.status,
          rpName: recruitment.rpName,
          discordId: recruitment.discordId,
          steamId: recruitment.steamId,
          threadId: recruitment.discordThreadId,
          createdAt: recruitment.createdAt,
          updatedAt: recruitment.updatedAt,
          links: {
            panel: panelUrl,
            thread: recruitment.discordThreadId
              ? `https://discord.com/channels/${process.env.GUILD_ID ?? ""}/${recruitment.discordThreadId}`
              : null,
          },
        },
      });
    }

    // Check complaint
    const complaint = await prisma.complaint.findFirst({
      where: { familyId, ticketKey },
      select: {
        id: true,
        ticketKey: true,
        status: true,
        targetName: true,
        authorDiscordId: true,
        discordThreadId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (complaint) {
      const panelBaseUrl = process.env.NEXTAUTH_URL ?? process.env.PANEL_BASE_URL ?? "";
      const panelUrl = panelBaseUrl ? `${panelBaseUrl}/staff/complaints/${complaint.id}` : null;

      return NextResponse.json({
        ok: true,
        ticket: {
          type: "COMPLAINT",
          id: complaint.id,
          ticketKey: complaint.ticketKey,
          status: complaint.status,
          targetRpName: complaint.targetName,
          authorDiscordId: complaint.authorDiscordId,
          threadId: complaint.discordThreadId,
          createdAt: complaint.createdAt,
          updatedAt: complaint.updatedAt,
          links: {
            panel: panelUrl,
            thread: complaint.discordThreadId
              ? `https://discord.com/channels/${process.env.GUILD_ID ?? ""}/${complaint.discordThreadId}`
              : null,
          },
        },
      });
    }

    return NextResponse.json({ ok: false, error: "Ticket not found" }, { status: 404 });
  } catch (error: any) {
    console.error("[/api/discord/ticket GET]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to fetch ticket" },
      { status: 500 }
    );
  }
}
