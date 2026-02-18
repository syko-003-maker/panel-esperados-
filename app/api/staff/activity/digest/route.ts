import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePrivileged } from "@/lib/guards";
import { getActivityConfig } from "@/lib/activity-config";
import { loadFamilyActivityState } from "@/lib/activity-legacy";
import { normalizeActivityState } from "@/lib/activity-backfill";
import { enqueueActivityDigest } from "@/lib/discord/discord";

const DEFAULT_FAMILY_ID = "esperados";

export async function POST(req: Request) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const body = await req.json().catch(() => ({}));
  const familyId = String(body?.familyId ?? DEFAULT_FAMILY_ID).trim() || DEFAULT_FAMILY_ID;

  const config = await getActivityConfig(prisma, familyId);
  if (!config.digestEnabled) {
    return NextResponse.json({ ok: false, error: "DIGEST_DISABLED" }, { status: 400 });
  }

  const members = await prisma.member.findMany({
    where: { familyId },
    select: { discordId: true, rpName: true },
    orderBy: { rpName: "asc" },
  });

  const state = await loadFamilyActivityState(prisma, familyId);
  normalizeActivityState(state, members);

  const now = new Date();
  const bucket = now.toISOString().slice(0, 10);
  const result = await enqueueActivityDigest({
    familyId,
    bucket,
    config,
    members,
    state,
    now,
  });

  return NextResponse.json({
    ok: true,
    familyId,
    queued: Boolean(result),
  });
}
