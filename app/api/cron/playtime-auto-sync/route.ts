import { NextRequest, NextResponse } from "next/server";
import { runLygPlaytimeSync } from "@/lib/lyg/sync-playtime";

function isAuthorized(req: NextRequest): boolean {
  const ingestSecret = req.headers.get("x-ingest-secret");
  const expectedIngest = process.env.INGEST_SECRET;
  if (ingestSecret && expectedIngest && ingestSecret === expectedIngest) {
    return true;
  }

  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (authHeader && cronSecret && authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  return false;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const result = await runLygPlaytimeSync("cron");
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Playtime auto-sync cron endpoint ready",
  });
}