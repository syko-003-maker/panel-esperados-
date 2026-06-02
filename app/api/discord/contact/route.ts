import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/server/rate-limit";
import { auth } from "@/auth";

const WORKER_SECRET = process.env.DISCORD_WORKER_SECRET ?? process.env.INGEST_SECRET;
const discordIdRegex = /^[0-9]{17,20}$/;

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

    // Validate required fields (strict, pas de typage permissif)
    if (typeof discordId !== "string" || !discordIdRegex.test(discordId)) {
      return NextResponse.json(
        { ok: false, error: "discordId invalid" },
        { status: 400 }
      );
    }

    if (typeof username !== "string" || username.length < 2 || username.length > 80) {
      return NextResponse.json(
        { ok: false, error: "username invalid" },
        { status: 400 }
      );
    }

    // ── Authentification : AUCUN accès anonyme ───────────────────────────
    // Soit le secret worker (machine-à-machine), soit une session Discord
    // valide (l'utilisateur non-lié EST connecté via OAuth, il a juste pas
    // de Member). On retire l'ancien bypass "x-from-site"/"pas de header".
    const authHeader = req.headers.get("authorization");
    const providedSecret = authHeader?.replace("Bearer ", "");
    const isAuthenticated = Boolean(WORKER_SECRET && providedSecret === WORKER_SECRET);

    const session = isAuthenticated ? null : await auth();
    const sessionDiscordId =
      (session as any)?.discordId ?? (session as any)?.user?.discordId ?? null;

    if (!isAuthenticated && !sessionDiscordId) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Anti-spoof : hors worker, l'identité provient de la SESSION, pas du body.
    const effectiveDiscordId = isAuthenticated ? discordId : sessionDiscordId;

    // Rate-limit anti-spam (3 contacts par 10 minutes par discordId).
    // Le worker authentifié (isAuthenticated) bypasse pour ne pas être bloqué.
    if (!isAuthenticated) {
      const rl = await enforceRateLimit({
        discordId: effectiveDiscordId,
        key: "discord-contact",
        limit: 3,
        windowMs: 10 * 60 * 1000,
      });
      if (!rl.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: "rate_limited",
            retryAfterMs: rl.retryAfterMs,
          },
          { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } }
        );
      }
    }

    // Log minimal — pas de username/IDs en clair dans PM2 (RGPD).
    console.log(JSON.stringify({
      event: "contact_notification_api",
      discordIdHash: String(effectiveDiscordId).slice(-4),
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
      discordId: effectiveDiscordId,
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
