import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePrivileged } from "@/lib/guards";
import { fetchPlaytimeSnapshot } from "@/lib/activity-fetch";
import {
  computeFlags,
  isTemporarilyExempt,
  isWl1Exempt,
} from "@/lib/activity-rules";
import {
  getMemberState,
  loadFamilyActivityState,
  saveFamilyActivityState,
} from "@/lib/activity-legacy";
import { enqueueActivityAlert, enqueueActivityDigest } from "@/lib/discord/discord";
import { activityConfigToRules, getActivityConfig } from "@/lib/activity-config";
import { normalizeActivityState } from "@/lib/activity-backfill";

const DEFAULT_FAMILY_ID = "esperados";

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function POST(req: Request) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const session: any = guard.session;
  const actorId = session?.userId ?? session?.user?.id;
  if (!actorId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const familyId = String(body?.familyId ?? DEFAULT_FAMILY_ID).trim() || DEFAULT_FAMILY_ID;

  const members = await prisma.member.findMany({
    where: { familyId },
    select: { discordId: true, rpName: true },
  });
  const memberMap = new Map<string, { discordId: string; rpName: string | null }>();
  for (const member of members) {
    if (member.discordId) {
      memberMap.set(String(member.discordId), { discordId: member.discordId, rpName: member.rpName });
    }
  }

  const config = await getActivityConfig(prisma, familyId);
  const rules = activityConfigToRules(config);
  const snapshot = await fetchPlaytimeSnapshot(familyId);
  const state = await loadFamilyActivityState(prisma, familyId);
  normalizeActivityState(state, [
    ...members,
    ...snapshot.map((item) => ({ discordId: item.discordId })),
  ]);
  const now = new Date();
  const nowIso = now.toISOString();
  const cooldownMs = Math.max(0, config.discordCooldownMinutes) * 60 * 1000;
  const bucket = nowIso.slice(0, 10);

  let syncedCount = 0;

  for (const item of snapshot) {
    const discordId = String(item.discordId ?? "").trim();
    if (!discordId) continue;
    syncedCount += 1;

    const member = memberMap.get(discordId) ?? null;
    const memberState = getMemberState(state, discordId);

    if (item.lastSeenAt) memberState.lastSeenAt = item.lastSeenAt;
    if (typeof item.playtimeMinutes === "number") {
      memberState.playtimeMinutes = item.playtimeMinutes;
    }

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

    const prevFlags = new Set(memberState.lastFlags ?? []);
    const prevSuggested = memberState.lastSuggestedAction ?? "NONE";
    const nextFlags = result.flags;
    const nextSuggested = result.suggestedAction;

    memberState.lastFlags = nextFlags;
    memberState.lastSuggestedAction = nextSuggested;

    if (isExempt) {
      memberState.lastAlerted = {};
      memberState.lastAlertAt = {};
      continue;
    }

    const memberName = item.name ?? member?.rpName ?? "Unknown";
    if (!memberState.lastAlertAt || typeof memberState.lastAlertAt !== "object") {
      memberState.lastAlertAt = {};
    }
    const lastAlertAt = memberState.lastAlertAt;

    if (config.discordAlertsEnabled) {
      const shouldSend = (type: string) => {
        const last = lastAlertAt[type];
        if (!last) return true;
        const parsed = new Date(last);
        if (Number.isNaN(parsed.getTime())) return true;
        return now.getTime() - parsed.getTime() >= cooldownMs;
      };

      if (nextFlags.includes("INACTIVE_14D") && !prevFlags.has("INACTIVE_14D")) {
        if (shouldSend("ACTIVITY_ALERT_INACTIVE")) {
          await enqueueActivityAlert({
            familyId,
            type: "ACTIVITY_ALERT_INACTIVE",
            discordId,
            name: memberName,
            playtimeMinutes: memberState.playtimeMinutes ?? null,
            lastSeenAt: memberState.lastSeenAt ?? null,
            inactiveDays: result.inactiveDays ?? null,
            suggestedAction: nextSuggested,
            bucket,
          });
          lastAlertAt["ACTIVITY_ALERT_INACTIVE"] = nowIso;
        }
      }

      if (nextFlags.includes("LOW_PLAYTIME") && !prevFlags.has("LOW_PLAYTIME")) {
        if (shouldSend("ACTIVITY_ALERT_LOW")) {
          await enqueueActivityAlert({
            familyId,
            type: "ACTIVITY_ALERT_LOW",
            discordId,
            name: memberName,
            playtimeMinutes: memberState.playtimeMinutes ?? null,
            lastSeenAt: memberState.lastSeenAt ?? null,
            inactiveDays: result.inactiveDays ?? null,
            suggestedAction: nextSuggested,
            bucket,
          });
          lastAlertAt["ACTIVITY_ALERT_LOW"] = nowIso;
        }
      }

      if (nextSuggested === "RECOMMEND_KICK" && prevSuggested !== "RECOMMEND_KICK") {
        if (shouldSend("ACTIVITY_ALERT_RECOMMEND_KICK")) {
          await enqueueActivityAlert({
            familyId,
            type: "ACTIVITY_ALERT_RECOMMEND_KICK",
            discordId,
            name: memberName,
            playtimeMinutes: memberState.playtimeMinutes ?? null,
            lastSeenAt: memberState.lastSeenAt ?? null,
            inactiveDays: result.inactiveDays ?? null,
            suggestedAction: nextSuggested,
            bucket,
          });
          lastAlertAt["ACTIVITY_ALERT_RECOMMEND_KICK"] = nowIso;
        }
      }
    }
  }

  state.lastSyncAt = now.toISOString();
  await saveFamilyActivityState(prisma, familyId, actorId, state);

  let digestQueued: boolean | null = null;
  if (config.digestEnabled && config.digestOnSync) {
    const digestRes = await enqueueActivityDigest({
      familyId,
      bucket,
      config,
      members,
      state,
      now,
    });
    digestQueued = Boolean(digestRes);
  }

  return NextResponse.json({
    ok: true,
    syncedCount,
    lastSyncAt: state.lastSyncAt,
    digestQueued,
  });
}
