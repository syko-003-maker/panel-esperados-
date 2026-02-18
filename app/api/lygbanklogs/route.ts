import { NextResponse } from "next/server";
import { debug } from "@/lib/logger";

/**
 * DEPRECATED: Use /api/lyg/banklogs instead
 * This route exists for backward compatibility and forwards to the canonical endpoint.
 */
export async function GET(req: Request) {
  debug(`[lygbanklogs] DEPRECATED: forwarding to /api/lyg/banklogs`);

  // Forward the request to the canonical endpoint
  const url = new URL(req.url);
  url.pathname = "/api/lyg/banklogs";

  try {
    const res = await fetch(url.toString(), {
      headers: req.headers,
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    debug(`[lygbanklogs] Forward error:`, err.message);
    return NextResponse.json(
      { error: "Failed to forward request" },
      { status: 500 }
    );
  }
}
