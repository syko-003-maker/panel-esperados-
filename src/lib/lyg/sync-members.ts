import { prisma } from "@/lib/db";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";
import { runDiscordSnapshotResync } from "@/lib/discord-snapshot-sync";
import { fetchMembersPage } from "@/lib/lyg/client";
import { runControlledLygSync, type ControlledSyncResult, type SyncSource } from "@/lib/lyg/sync-runner";
import { logInfo, logWarn } from "@/lib/obs";
import { normalizeSteamId64 } from "@/lib/validation/steamid";

export type MembersSyncMetrics = {
  fetched: number;
  created: number;
  updated: number;
  unchanged: number;
  skippedInvalid: number;
};

export type MembersSyncResult = ControlledSyncResult<MembersSyncMetrics>;

const DISCORD_SNAPSHOT_SYNC_INTERVAL_MS = 60 * 60 * 1000;
let lastDiscordSnapshotSyncAt = 0;
let discordSnapshotSyncInFlight: Promise<void> | null = null;

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function maybeRunDiscordSnapshotResync(familyDbId: string, source: SyncSource) {
  if (source !== "cron" && source !== "manual") return;
  if (discordSnapshotSyncInFlight) return;

  const now = Date.now();
  if (now - lastDiscordSnapshotSyncAt < DISCORD_SNAPSHOT_SYNC_INTERVAL_MS) {
    return;
  }

  const staleMembersCount = await prisma.member.count({
    where: {
      familyId: familyDbId,
      discordId: { not: null },
      OR: [
        { discordRolesUpdatedAt: null },
        { discordSnapshot: null },
      ],
    },
  });

  if (staleMembersCount === 0) {
    lastDiscordSnapshotSyncAt = now;
    return;
  }

  discordSnapshotSyncInFlight = (async () => {
    lastDiscordSnapshotSyncAt = Date.now();

    try {
      logInfo("lyg_members_trigger_discord_snapshot_resync", {
        source,
        staleMembersCount,
      });

      const result = await runDiscordSnapshotResync(source === "manual" ? "manual" : "cron");

      logInfo("lyg_members_trigger_discord_snapshot_resync_done", {
        source,
        staleMembersCount,
        ...result,
      });
    } catch (error) {
      logWarn("lyg_members_trigger_discord_snapshot_resync_failed", {
        source,
        staleMembersCount,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      discordSnapshotSyncInFlight = null;
    }
  })();

  await discordSnapshotSyncInFlight;
}

export async function runLygMembersSync(source: SyncSource = "cron"): Promise<MembersSyncResult> {
  const familySlug = DEFAULT_FAMILY_ID;

  const toDateOrNull = (value: unknown): Date | null => {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === "string" || typeof value === "number") {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  };

  return runControlledLygSync<MembersSyncMetrics>({
    type: "members",
    source,
    familyId: familySlug,
    minIntervalMs: 60_000,
    lockTtlMs: 120_000,
    run: async () => {
      const familyDbId = await resolveFamilyId(familySlug);
      const response = await fetchMembersPage();

      if (!response.ok) {
        const e: any = new Error(response.error ?? "LYG members fetch failed");
        e.status = response.status;
        e.endpoint = "members";
        throw e;
      }

      const fetched = Array.isArray(response.data) ? response.data : [];
      const now = new Date();

      const validMembers = fetched
        .map((m) => {
          const steamId = normalizeSteamId64(m.steamId64);
          if (!steamId) return null;
          return {
            steamId,
            discordId: m.discordId ? String(m.discordId).trim() : null,
            rpName: asNonEmptyString(m.rpName),
            grade: m.grade ? String(m.grade).trim() : null,
            joinedAt: toDateOrNull(m.joinedAt),
          };
        })
        .filter((m): m is NonNullable<typeof m> => Boolean(m));

      const skippedInvalid = Math.max(0, fetched.length - validMembers.length);

      const steamIds = validMembers.map((m) => m.steamId);
      const discordIds = validMembers.map((m) => m.discordId).filter((v): v is string => Boolean(v));

      const existingMembers = await prisma.member.findMany({
        where: {
          familyId: familyDbId,
          OR: [
            steamIds.length ? { steamId: { in: steamIds } } : undefined,
            discordIds.length ? { discordId: { in: discordIds } } : undefined,
          ].filter(Boolean) as any,
        },
        select: {
          id: true,
          steamId: true,
          discordId: true,
          rpName: true,
          grade: true,
          joinedAt: true,
          isActive: true,
        },
      });

      const bySteam = new Map(existingMembers.filter((m) => m.steamId).map((m) => [m.steamId as string, m]));
      const byDiscord = new Map(existingMembers.filter((m) => m.discordId).map((m) => [m.discordId as string, m]));

      let created = 0;
      let updated = 0;
      let unchanged = 0;

      for (const incoming of validMembers) {
        const existing = bySteam.get(incoming.steamId) ?? (incoming.discordId ? byDiscord.get(incoming.discordId) : null);

        const resolvedDiscordId = incoming.discordId ?? existing?.discordId ?? null;
        const resolvedRpName = incoming.rpName ?? existing?.rpName ?? null;
        const resolvedGrade = incoming.grade ?? existing?.grade ?? null;

        const payload = {
          steamId: incoming.steamId,
          discordId: resolvedDiscordId,
          rpName: resolvedRpName,
          grade: resolvedGrade,
         joinedAt: incoming.joinedAt,
          isActive: true,
          source: "LYG" as const,
          lastSeenAt: now,
          missingSince: null,
          missingFromLygSince: null,
        };

        if (!existing) {
          await prisma.member.create({
            data: {
              familyId: familyDbId,
              ...payload,
            },
          });
          created += 1;
          continue;
        }

        const sameRpName = (existing.rpName ?? null) === payload.rpName;
        const sameGrade = (existing.grade ?? null) === payload.grade;
        const sameDiscord = (existing.discordId ?? null) === payload.discordId;
        const sameJoinedAt = existing.joinedAt?.getTime() === payload.joinedAt?.getTime();
        const sameActive = existing.isActive === true;

        if (sameRpName && sameGrade && sameDiscord && sameJoinedAt && sameActive) {
          await prisma.member.update({
            where: { id: existing.id },
            data: {
              lastSeenAt: now,
              missingSince: null,
              missingFromLygSince: null,
            },
          });
          unchanged += 1;
          continue;
        }

        await prisma.member.update({
          where: { id: existing.id },
          data: payload,
        });
        updated += 1;
      }

      await maybeRunDiscordSnapshotResync(familyDbId, source);

      return {
        fetched: validMembers.length,
        created,
        updated,
        unchanged,
        skippedInvalid,
      };
    },
  });
}
