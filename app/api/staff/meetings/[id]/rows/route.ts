import { NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/guards";

export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const _paramsResolved = await params;
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;
  return NextResponse.json({ ok: false, error: "MEETING_ROW_DISABLED" }, { status: 410 });
}
