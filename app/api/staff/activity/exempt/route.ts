import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChef } from "@/lib/guards";
import { computeFlags, isTemporarilyExempt, isWl1Exempt } from "@/lib/activity-rules";
import { getMemberState, loadFamilyActivityState, saveFamilyActivityState } from "@/lib/activity-legacy";
import { activityConfigToRules, getActivityConfig } from "@/lib/activity-config";
import { normalizeActivityState } from "@/lib/activity-backfill";

const DEFAULT_FAMILY_ID = "esperados";

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function POST(req: Request) {
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  const session: any = guard.session;
  const actorId = session?.userId ?? session?.user?.id;
  if (!actorId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const familyId = String(body.familyId ?? DEFAULT_FAMILY_ID).trim() || DEFAULT_FAMILY_ID;
  const discordId = String(body.discordId ?? "").trim();
  if (!discordId) {
    return NextResponse.json({ ok: false, error: "MISSING_DISCORD_ID" }, { status: 400 });
  }

  const untilRaw = body.untilISO ? String(body.untilISO).trim() : "";
  let untilIso: string | null = null;
  if (untilRaw) {
    const parsed = new Date(untilRaw);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ ok: false, error: "INVALID_EXEMPT_UNTIL" }, { status: 400 });
    }
    untilIso = parsed.toISOString();
  }
  const reason = body.reason ? String(body.reason).trim() : "";
  if (untilIso && !reason) {
    return NextResponse.json({ ok: false, error: "MISSING_REASON" }, { status: 400 });
  }

  const state = await loadFamilyActivityState(prisma, familyId);
  normalizeActivityState(state, [{ discordId }]);
  const memberState = getMemberState(state, discordId);
  const prevExemptUntil = memberState.exemptUntil ?? null;
  const prevReason = memberState.exemptReason ?? null;
  memberState.exemptUntil = untilIso;
  memberState.exemptReason = reason || null;
  memberState.lastAlerted = {};
  memberState.lastAlertAt = {};
  memberState.lastFlags = [];
  memberState.lastSuggestedAction = "NONE";

  state.lastSyncAt = state.lastSyncAt ?? undefined;
  await saveFamilyActivityState(prisma, familyId, actorId, state);

  const member = await prisma.member.findUnique({
    where: { familyId_discordId: { familyId, discordId } },
    select: { discordId: true, rpName: true },
  });

  const now = new Date();
  const config = await getActivityConfig(prisma, familyId);
  const rules = activityConfigToRules(config);
  const exemptByRole = isWl1Exempt(member as any);
  const exemptByTime = isTemporarilyExempt(memberState.exemptUntil ?? null);
  const isExempt = exemptByRole || exemptByTime;

  const lastSeenDate = parseDate(memberState.lastSeenAt);
  const result = computeFlags({
    now,
    lastSeenAt: lastSeenDate,
    playtimeMinutes: memberState.playtimeMinutes ?? null,
    exempt: isExempt,
    rules,
  });

  await prisma.auditLog.create({
    data: {
      familyId,
      actorId,
      action: "ACTIVITY_EXEMPT",
      entity: "Member",
      entityId: discordId,
      meta: {
        untilISO: untilIso,
        reason: reason || null,
        previousUntilISO: prevExemptUntil,
        previousReason: prevReason,
      },
    },
  });

  return NextResponse.json({
    ok: true,
    member: {
      discordId,
      name: member?.rpName ?? "Unknown",
      isExempt,
      exemptUntil: memberState.exemptUntil ?? null,
      exemptReason: memberState.exemptReason ?? null,
      playtimeMinutes: memberState.playtimeMinutes ?? null,
      lastSeenAt: memberState.lastSeenAt ?? null,
      inactiveDays: result.inactiveDays ?? null,
      flags: result.flags,
      suggestedAction: result.suggestedAction,
      reasons: result.reasons,
    },
  });
}
