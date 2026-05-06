import { NextResponse } from "next/server";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { collectSystemStats } from "@/lib/system-stats";
import { getLygStats } from "@/lib/lyg-stats";
import { ensureOnlineStatusLoopStarted } from "@/lib/online-status-loop";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  // S'assurer que le loop online-status tourne (même si personne n'a ouvert /staff/members)
  ensureOnlineStatusLoopStarted();

  const [system, lyg] = await Promise.all([
    collectSystemStats(),
    Promise.resolve(getLygStats()),
  ]);

  return NextResponse.json({ ok: true, system, lyg, timestamp: Date.now() });
}
