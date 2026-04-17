import { NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/guards";
import { runLygInfosSync } from "@/lib/lyg/sync-infos";

export async function POST(req: Request) {
  void req;
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const result = await runLygInfosSync("manual");
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
