import { NextRequest, NextResponse } from "next/server";
import { sendPushToDiscordIds, sendPushToStaff } from "@/lib/push";

/**
 * Route interne worker → panel : déclenche une notification push depuis un
 * process qui n'a pas accès à la lib (ex. poller warns LYG du worker).
 * Même contrat de sécurité que les autres routes /api/ingest/* (x-ingest-secret).
 *
 * Body : { audience: "staff" } OU { discordIds: string[] }
 *        + { title, body, url?, tag? }
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const INGEST_SECRET = process.env.DISCORD_INGEST_SECRET ?? process.env.INGEST_SECRET;

if (!INGEST_SECRET) {
  console.error("[ingest/push] INGEST_SECRET not configured");
}

function isAuthorized(req: NextRequest): boolean {
  if (!INGEST_SECRET) return false;
  return req.headers.get("x-ingest-secret") === INGEST_SECRET;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const title = String((body as any)?.title ?? "").trim();
  const text = String((body as any)?.body ?? "").trim();
  if (!title || !text) {
    return NextResponse.json({ ok: false, error: "MISSING_TITLE_OR_BODY" }, { status: 400 });
  }

  const payload = {
    title: title.slice(0, 120),
    body: text.slice(0, 300),
    url: typeof (body as any)?.url === "string" ? (body as any).url : "/dashboard",
    tag: typeof (body as any)?.tag === "string" ? (body as any).tag : undefined,
  };

  const audience = (body as any)?.audience;
  if (audience === "staff") {
    const res = await sendPushToStaff(payload);
    return NextResponse.json({ ok: true, ...res });
  }

  const ids = Array.isArray((body as any)?.discordIds)
    ? ((body as any).discordIds as unknown[]).map((x) => String(x)).filter((x) => /^\d{15,21}$/.test(x))
    : [];
  if (!ids.length) {
    return NextResponse.json({ ok: false, error: "MISSING_AUDIENCE" }, { status: 400 });
  }
  const res = await sendPushToDiscordIds(ids, payload);
  return NextResponse.json({ ok: true, ...res });
}
