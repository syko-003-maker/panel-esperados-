import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePrivileged } from "@/lib/guards";
import {
  computeFlags,
  isTemporarilyExempt,
  isWl1Exempt,
} from "@/lib/activity-rules";
import { loadFamilyActivityState } from "@/lib/activity-legacy";
import { activityConfigToRules, getActivityConfig } from "@/lib/activity-config";
import { normalizeActivityState } from "@/lib/activity-backfill";

const DEFAULT_FAMILY_ID = "esperados";

function getMemberName(member: any) {
  return member?.rpName ? String(member.rpName) : member?.discordId ? String(member.discordId) : "Unknown";
}

function getMemberRole(member: any) {
  const candidates = [
    member?.role,
    member?.rank,
    member?.grade,
    member?.familyRole,
    member?.group,
  ];
  const found = candidates.find((value) => typeof value === "string" && value.trim().length > 0);
  return found ? String(found) : null;
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET(req: Request) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const familyId = searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;

  const members = await prisma.member.findMany({
    where: { familyId },
    select: { discordId: true, rpName: true },
    orderBy: { rpName: "asc" },
  });

  const state = await loadFamilyActivityState(prisma, familyId);
  normalizeActivityState(state, members);
  const config = await getActivityConfig(prisma, familyId);
  const rules = activityConfigToRules(config);
  const now = new Date();

  const items = members
    .filter((member) => member.discordId)
    .map((member) => {
      const discordId = String(member.discordId);
      const memberState = state.members?.[discordId];
      const exemptByRole = isWl1Exempt(member as any);
      const exemptByTime = isTemporarilyExempt(memberState?.exemptUntil ?? null);
      const isExempt = exemptByRole || exemptByTime;
      const lastSeenAt = memberState?.lastSeenAt ? String(memberState.lastSeenAt) : null;
      const lastSeenDate = parseDate(lastSeenAt);

      const result = computeFlags({
        now,
        lastSeenAt: lastSeenDate,
        playtimeMinutes: memberState?.playtimeMinutes ?? null,
        exempt: isExempt,
        rules,
      });

      return {
        discordId,
        name: getMemberName(member),
        role: getMemberRole(member),
        isExempt,
        exemptUntil: memberState?.exemptUntil ?? null,
        exemptReason: memberState?.exemptReason ?? null,
        playtimeMinutes: memberState?.playtimeMinutes ?? null,
        lastSeenAt,
        inactiveDays: result.inactiveDays ?? null,
        flags: result.flags,
        suggestedAction: result.suggestedAction,
        reasons: result.reasons,
      };
    });

  const counts = items.reduce(
    (acc, item) => {
      acc.total += 1;
      if (item.isExempt) acc.exempt += 1;
      if (item.flags.includes("INACTIVE_14D")) acc.inactive14d += 1;
      if (item.flags.includes("LOW_PLAYTIME")) acc.lowPlaytime += 1;
      if (item.suggestedAction === "RECOMMEND_KICK") acc.recommendKick += 1;
      return acc;
    },
    {
      total: 0,
      exempt: 0,
      inactive14d: 0,
      lowPlaytime: 0,
      recommendKick: 0,
    }
  );

  return NextResponse.json({
    ok: true,
    familyId,
    lastSyncAt: state.lastSyncAt ?? null,
    members: items,
    counts,
  });
}
