import { NextResponse } from "next/server";
import { recordLygCall, setLygPauseUntil, type Service } from "@/lib/lyg-stats";

/**
 * Endpoint interne — reçoit les events d'appels LYG depuis discord-worker.
 * Sécurisé via header x-ingest-secret.
 */
export async function POST(req: Request) {
  const secret = req.headers.get("x-ingest-secret");
  const expected = process.env.INGEST_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });

  const service = (body.service as Service | undefined) ?? "panel";
  if (!["panel", "worker"].includes(service)) {
    return NextResponse.json({ ok: false, error: "Invalid service" }, { status: 400 });
  }

  // Event "call"
  if (body.type === "call") {
    const ok = Boolean(body.ok);
    const status = Number(body.status ?? 0);
    const endpoint = String(body.endpoint ?? "unknown").slice(0, 200);
    recordLygCall({ ok, status, endpoint, service });
    return NextResponse.json({ ok: true });
  }

  // Event "pause" (rate-limited, pauseUntil ms)
  if (body.type === "pause") {
    const until = Number(body.until ?? 0);
    const endpoint = String(body.endpoint ?? "unknown").slice(0, 200);
    setLygPauseUntil(until, endpoint, service);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "Unknown type" }, { status: 400 });
}
