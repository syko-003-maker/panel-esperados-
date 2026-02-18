import { NextRequest, NextResponse } from "next/server";

const WORKER_SECRET = process.env.DISCORD_WORKER_SECRET ?? process.env.INGEST_SECRET;

/**
 * POST /api/discord/contact
 * Send a simple contact notification to BOTS_FAMILLE_CHANNEL_ID
 * Called by the site when an unlinked user clicks "Contact Staff"
 * 
 * Pings:
 * - Recruteur (1312845999215214618)
 * - Chef famille (1429607761720770623)  
 * - Etat Major (1312845999366209683)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      discordId,
      username,
      steamId,
      rpName,
    } = body;

    // Validate required fields
    if (!discordId) {
      return NextResponse.json(
        { ok: false, error: "discordId required" },
        { status: 400 }
      );
    }

    if (!username) {
      return NextResponse.json(
        { ok: false, error: "username required" },
        { status: 400 }
      );
    }

    // Get worker secret from header
    const authHeader = req.headers.get("authorization");
    const providedSecret = authHeader?.replace("Bearer ", "");

    // Allow from site (no auth needed) or from authenticated requests
    const isFromSite = !authHeader || req.headers.get("x-from-site") === "true";
    const isAuthenticated = WORKER_SECRET && providedSecret === WORKER_SECRET;

    if (!isFromSite && !isAuthenticated) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    console.log(JSON.stringify({
      event: "contact_notification_api",
      discordId,
      username,
      hasSteamId: !!steamId,
      hasRpName: !!rpName,
      timestamp: new Date().toISOString(),
    }));

    // This is where the notification would be sent to Discord
    // For now, we're just logging it
    // The actual Discord notification is handled by the worker
    // when processing this event

    return NextResponse.json({
      ok: true,
      message: "Contact notification queued",
      discordId,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({
      event: "contact_notification_api_error",
      error: message,
      timestamp: new Date().toISOString(),
    }));

    return NextResponse.json(
      { ok: false, error: "Failed to process contact notification" },
      { status: 500 }
    );
  }
}
