import { NextRequest, NextResponse } from "next/server";
import { getRoleConfig } from "@/lib/roles";

const WORKER_SECRET = process.env.DISCORD_WORKER_SECRET;

function validateSecret(req: Request): boolean {
  if (!WORKER_SECRET) return false;
  const secret = req.headers.get("x-worker-secret");
  return secret === WORKER_SECRET;
}

/**
 * GET /api/discord/roles
 * Returns role mapping configuration for Discord sync
 * Protected by x-worker-secret header
 */
export async function GET(req: NextRequest) {
  // Check secret is configured
  if (!WORKER_SECRET) {
    console.error("[/api/discord/roles] DISCORD_WORKER_SECRET not configured");
    return NextResponse.json(
      { ok: false, error: "DISCORD_WORKER_SECRET not configured" },
      { status: 500 }
    );
  }

  // Validate secret header
  if (!validateSecret(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const config = getRoleConfig();
    
    return NextResponse.json({
      ok: true,
      ...config,
    });
  } catch (err) {
    console.error("[/api/discord/roles] Error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
