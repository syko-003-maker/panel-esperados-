import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChef } from "@/lib/guards";
import { appendActivityAction, getMemberState, loadFamilyActivityState, saveFamilyActivityState } from "@/lib/activity-legacy";
import { enqueueActivityActionNotify } from "@/lib/discord/discord";
import { randomUUID } from "crypto";
import { computeFlags, isTemporarilyExempt, isWl1Exempt } from "@/lib/activity-rules";
import { activityConfigToRules, getActivityConfig } from "@/lib/activity-config";
import { normalizeActivityState } from "@/lib/activity-backfill";
import { toFamilyCuid } from "@/lib/family";

const DEFAULT_FAMILY_ID = "esperados";

type ActionType = "WARN_ORAL" | "WARN_LIGHT" | "KICK_DONE" | "NOTE";

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

  const familyId = await toFamilyCuid(String(body.familyId ?? DEFAULT_FAMILY_ID).trim());
  const discordId = String(body.discordId ?? "").trim();
  if (!discordId) {
    return NextResponse.json({ ok: false, error: "MISSING_DISCORD_ID" }, { status: 400 });
  }

  const typeRaw = String(body.type ?? "").toUpperCase();
  const type: ActionType =
    typeRaw === "WARN_ORAL" || typeRaw === "WARN_LIGHT" || typeRaw === "KICK_DONE" || typeRaw === "NOTE"
      ? (typeRaw as ActionType)
      : "NOTE";
  const note = body.note ? String(body.note).trim() : "";

  const state = await loadFamilyActivityState(prisma, familyId);
  normalizeActivityState(state, [{ discordId }]);
  getMemberState(state, discordId);

  const action = {
    id: randomUUID(),
    at: new Date().toISOString(),
    discordId,
    type,
    note: note || undefined,
    byDiscordId: session?.discordId ?? session?.user?.discordId,
  };

  appendActivityAction(state, action);
  await saveFamilyActivityState(prisma, familyId, actorId, state);

  const member = await prisma.member.findUnique({
    where: { familyId_discordId: { familyId, discordId } },
    select: { rpName: true },
  });

  const config = await getActivityConfig(prisma, familyId);
  const rules = activityConfigToRules(config);
  const memberState = getMemberState(state, discordId);
  const exemptByRole = isWl1Exempt(member as any);
  const exemptByTime = isTemporarilyExempt(memberState.exemptUntil ?? null);
  const isExempt = exemptByRole || exemptByTime;
  const lastSeenAt = memberState.lastSeenAt ? new Date(memberState.lastSeenAt) : null;
  const result = computeFlags({
    now: new Date(),
    lastSeenAt: lastSeenAt && !Number.isNaN(lastSeenAt.getTime()) ? lastSeenAt : null,
    playtimeMinutes: memberState.playtimeMinutes ?? null,
    exempt: isExempt,
    rules,
  });

  await prisma.auditLog.create({
    data: {
      familyId,
      actorId,
      action: "ACTIVITY_ACTION",
      entity: "Member",
      entityId: discordId,
      meta: {
        type,
        note: note || null,
        suggestedActionAtThatTime: result.suggestedAction,
        flagsAtThatTime: result.flags,
      },
    },
  });

  await enqueueActivityActionNotify({
    familyId,
    discordId,
    name: member?.rpName ?? "Unknown",
    type,
    note: note || null,
    byDiscordId: action.byDiscordId ?? null,
  });

  return NextResponse.json({ ok: true, action });
}
