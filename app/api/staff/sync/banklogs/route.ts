import { NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/guards";
import { runLygBanklogsSync } from "@/lib/lyg/sync-banklogs";

export async function POST(req: Request) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  try {
    const result = await runLygBanklogsSync("manual");
    const status = result.ok ? 200 : 502;
    return NextResponse.json(result, { status });
  } catch (e: any) {
    console.error("[banklogs-sync] error", { error: String(e?.message ?? e) });
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
