import { redirect } from "next/navigation";
import { getSession } from "@/auth";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { checkBootstrapState } from "@/lib/bootstrap";
import { enrichMembersWithRanks } from "@/lib/discord-rank-batch";
import { debug as logDebug } from "@/lib/logger";
import { MembersListClient } from "./members-list-client";
import { getUserDiscordIdFromSession } from "@/server/auth/discord";
import { extractDiscordAvatarHash } from "@/lib/discord/getDiscordAvatarUrl";

type DiscordSnapshotStatus = "OK" | "HORS_DISCORD" | "NON_VERIFIE" | "STALE";

function getSnapshotStaleMinutes(): number {
  const raw = Number(process.env.DISCORD_SNAPSHOT_STALE_MINUTES ?? "120");
  if (!Number.isFinite(raw) || raw <= 0) return 120;
  return Math.floor(raw);
}

function computeDiscordStatus(snapshot: {
  isInGuild: boolean;
  lastCheckedAt: Date;
} | null): DiscordSnapshotStatus {
  if (!snapshot) return "NON_VERIFIE";

  const staleMinutes = getSnapshotStaleMinutes();
  const staleMs = staleMinutes * 60 * 1000;
  const isStale = Date.now() - snapshot.lastCheckedAt.getTime() > staleMs;

  if (isStale) return "STALE";
  return snapshot.isInGuild ? "OK" : "HORS_DISCORD";
}

export default async function MembersPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Get debug flag from query params
  const searchParams = await props.searchParams;
  const debug = searchParams.debug === "1";

  // ⚠️ DIAGNOSTIC: Log Discord token availability
  const hasDiscordToken = Boolean(process.env.DISCORD_BOT_TOKEN);
  const hasGuildId = Boolean(process.env.DISCORD_GUILD_ID);
  if (!hasDiscordToken || !hasGuildId) {
    const msg = `[members-page:CRITICAL] Discord config incomplete: has_bot_token=${hasDiscordToken}, has_guild_id=${hasGuildId}`;
    logDebug(msg);
    console.warn(msg);
  }

  // ✅ PATCH: Unified staff protection (session + isStaff + member linked)
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  // Resolve the Family cuid from slug
  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);

  // Check if DB needs bootstrap
  const bootstrap = await checkBootstrapState(familyDbId);

  // ✅ Fetch ALL members (active + inactive) for toggle functionality
  // Client-side filter by showInactive state, server counts only active
  const members = await prisma.member.findMany({
    where: { familyId: familyDbId },
    orderBy: [{ isActive: "desc" }, { gradeLevel: "desc" }, { rpName: "asc" }],
    select: {
      id: true,
      discordId: true,
      steamId: true,
      rpName: true,
      discordDisplayName: true,
      discordUsername: true,
      grade: true,
      gradeLevel: true,
      rankLabel: true,
      rankRoleId: true,
      isActive: true,
      joinedAt: true,
      updatedAt: true,
      // ✅ Discord mirror fields (updated by worker)
      discordInGuild: true,
      discordRoleIds: true,
      discordRolesUpdatedAt: true,
      discordLastError: true,
      playtime7d: true,
      playtime7dUpdatedAt: true,
      discordSnapshot: {
        select: {
          isInGuild: true,
          rolesJson: true,
          nickname: true,
          username: true,
          lastCheckedAt: true,
          lastSuccessAt: true,
          lastError: true,
          source: true,
        },
      },
    },
  });

  // ✅ Batch enrich members with Discord ranks (DB-only on UI render)
  // For each member with discordId but no rankLabel in DB:
  // - Fetch their Discord roles
  // - Resolve rank (1 of 15 managed roles)
  // - Return enriched member with rankLabel populated
  const debugDiscord = process.env.DEBUG_DISCORD === "1";
  if (debugDiscord) {
    console.log("[members-page] DB-only Discord path: skipping live Discord API calls");
  }
  const enriched = await enrichMembersWithRanks(members, {
    debug,
    allowDiscordFetch: false,
  });

  const discordIds = Array.from(
    new Set(
      enriched
        .map((m) => m.discordId)
        .filter((discordId): discordId is string => Boolean(discordId))
    )
  );

  const avatarHashByDiscordId = new Map<string, string>();
  if (discordIds.length > 0) {
    const linkedAccounts = await prisma.account.findMany({
      where: {
        provider: "discord",
        providerAccountId: { in: discordIds },
      },
      select: {
        providerAccountId: true,
        user: {
          select: {
            image: true,
          },
        },
      },
    });

    for (const account of linkedAccounts) {
      const hash = extractDiscordAvatarHash(account.user?.image);
      if (hash) avatarHashByDiscordId.set(account.providerAccountId, hash);
    }
  }

  if (debug || process.env.DEBUG_DISCORD === "1") {
    const statusCounts = {
      ok: 0,
      horsDiscord: 0,
      nonVerifie: 0,
      stale: 0,
    };

    enriched.forEach((m) => {
      const status = computeDiscordStatus(m.discordSnapshot ?? null);
      if (status === "OK") statusCounts.ok += 1;
      if (status === "HORS_DISCORD") statusCounts.horsDiscord += 1;
      if (status === "NON_VERIFIE") statusCounts.nonVerifie += 1;
      if (status === "STALE") statusCounts.stale += 1;
    });

    logDebug("[members-page] Discord snapshot statuses", {
      total: enriched.length,
      ...statusCounts,
      staleMinutes: getSnapshotStaleMinutes(),
    });
  }

  // 📝 Persist any rankLabel/gradeLevel changes back to database
  // This ensures future page loads have correct sort order
  const updates = enriched
    .filter((m) => {
      const original = members.find((orig) => orig.id === m.id);
      if (!original) return false;

      return (
        (m.rankLabel ?? null) !== (original.rankLabel ?? null) ||
        (m.rankRoleId ?? null) !== (original.rankRoleId ?? null) ||
        (m.gradeLevel ?? 0) !== (original.gradeLevel ?? 0)
      );
    })
    .map((m) => 
      prisma.member.update({
        where: { id: m.id },
        data: {
          rankLabel: m.rankLabel,
          rankRoleId: m.rankRoleId || undefined,
          gradeLevel: m.gradeLevel,
        },
      })
    );
  
  if (updates.length > 0) {
    try {
      await prisma.$transaction(updates);
      if (debug) {
        console.log(`[members-page] Updated ${updates.length} members with resolved ranks`);
      }
    } catch (err) {
      if (debug) {
        console.error("[members-page] Failed to persist rank updates:", err);
      }
      // Continue gracefully - display data is still correct
    }
  }

  // ✅ Get session Discord ID for client-side active user override
  const sessionDiscordId = await getUserDiscordIdFromSession(
    guard?.session || (await getSession())
  );

  const data = enriched.map((m) => {
    // ✅ Calculate effectiveActive: session user is ALWAYS active (can't be marked ancien)
    const isSessionUser = !!(sessionDiscordId && m.discordId === sessionDiscordId);
    const effectiveActive = isSessionUser ? true : m.isActive;
    const discordStatus = computeDiscordStatus(m.discordSnapshot ?? null);

    return {
      ...m,
      joinedAt: m.joinedAt?.toISOString() ?? null,
      updatedAt: m.updatedAt.toISOString(),
      playtime7d: m.playtime7d ?? 0,
      playtime7dUpdatedAt: m.playtime7dUpdatedAt?.toISOString() ?? null,
      discordAvatarHash: m.discordId ? avatarHashByDiscordId.get(m.discordId) ?? null : null,
      discordStatus,
      effectiveActive, // ✅ Use for filtering/sorting instead of isActive
      isSessionUser,   // ✅ For client-side pinning at top
    };
  });

  return <MembersListClient members={data} bootstrap={bootstrap} debug={debug} sessionDiscordId={sessionDiscordId} />;
}


