import { NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/guards";
import { runLygMembersSync } from "@/lib/lyg/sync-members";

export async function POST() {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const result = await runLygMembersSync("manual");
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
