import { NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/guards";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const key = searchParams.get("key");
  if (!key) {
    return NextResponse.json({ ok: false, error: "Missing key" }, { status: 400 });
  }

  const row = await prisma.syncState.findUnique({ where: { key } });

  return NextResponse.json({
    ok: true,
    key,
    syncedAt: row?.syncedAt ?? null,
    meta: row?.meta ?? null,
    cursor: row?.cursor ?? null,
  });
}
