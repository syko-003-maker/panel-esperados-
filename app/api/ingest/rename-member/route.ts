/**
 * POST /api/ingest/rename-member
 *
 * Secure ingest endpoint to trigger a Discord member rename
 * Called by Discord worker's /syncname command
 *
 * Protected by INGEST_SECRET header
 */

import { NextRequest, NextResponse } from "next/server";
import { postDiscordRename } from "@/server/worker/post-discord";

const INGEST_SECRET = process.env.INGEST_SECRET || "";

export async function POST(req: NextRequest) {
  try {
    // Verify secret
    const secret = req.headers.get("x-ingest-secret");
    if (!secret || secret !== INGEST_SECRET) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { discordId, rpName, reason } = body;

    if (!discordId || typeof discordId !== "string") {
      return NextResponse.json(
        { ok: false, error: "Invalid discordId" },
        { status: 400 }
      );
    }

    console.log("[api/ingest/rename-member] Rename triggered", {
      discordId,
      rpName,
      reason,
      timestamp: new Date().toISOString(),
    });

    // Call worker via helper
    const result = await postDiscordRename({
      discordId,
      rpName,
      reason: reason || "Rename from panel",
    });

    console.log("[api/ingest/rename-member] Rename result", {
      discordId,
      ok: result.ok,
      nickname: result.ok ? result.nickname : null,
      error: result.ok ? null : result.error,
      skipped: result.ok ? null : result.skipped,
    });

    // Return result
    if (result.ok) {
      return NextResponse.json({
        ok: true,
        nickname: result.nickname,
      });
    } else {
      return NextResponse.json(
        {
          ok: false,
          error: result.error,
          skipped: result.skipped,
        },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("[api/ingest/rename-member] error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Internal error",
      },
      { status: 500 }
    );
  }
}
