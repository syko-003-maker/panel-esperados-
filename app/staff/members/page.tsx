import { redirect } from "next/navigation";
import { getSession } from "@/auth";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { checkBootstrapState } from "@/lib/bootstrap";
import { enrichMembersWithRanks } from "@/lib/discord-rank-batch";
import { CHEF_FAMILLE_ROLE_ID } from "@/lib/discord-roles";
import { GRADE_ROLE_IDS_ORDERED } from "@/lib/grade-colors";
import { debug as logDebug } from "@/lib/logger";
import { MembersListClient } from "./members-list-client";
import { getUserDiscordIdFromSession } from "@/server/auth/discord";

// Type for member status derived from Discord verification
type MemberStatus = "active" | "former" | "not-found" | "unavailable" | "unknown";

type DiscordMemberStatus = {
  ok: boolean;
  inGuild?: boolean;
  roles?: string[];
  errorCode?: "RATE_LIMIT" | "CONFIG_MISSING" | "UNAVAILABLE";
};

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
    },
  });

  // ✅ Batch enrich members with Discord ranks
  // For each member with discordId but no rankLabel in DB:
  // - Fetch their Discord roles
  // - Resolve rank (1 of 15 managed roles)
  // - Return enriched member with rankLabel populated
  const enriched = await enrichMembersWithRanks(members, { debug });

  // ✅ DISCORD STATUS FROM DB (not API - prevents 429 spam)
  // Member.discordInGuild + discordRoleIds are updated by worker
  const memberStatusMap = new Map<string, MemberStatus>();

  const VALID_ACTIVE_ROLES = new Set(
    [CHEF_FAMILLE_ROLE_ID, ...GRADE_ROLE_IDS_ORDERED].filter(Boolean)
  );

  for (const member of enriched) {
    if (!member.discordId) {
      memberStatusMap.set(member.id, "unavailable"); // No discordId = not linked
      continue;
    }

    // Use DB mirror (updated by worker/resync)
    if (member.discordInGuild === null || member.discordInGuild === undefined) {
      // Never synced
      memberStatusMap.set(member.discordId, "unknown");
    } else if (member.discordInGuild === false) {
      // Left Discord
      memberStatusMap.set(member.discordId, "not-found");
    } else {
      // In Discord, check roles
      const roles = member.discordRoleIds || [];
      const hasValidRole = roles.some((roleId: string) => VALID_ACTIVE_ROLES.has(roleId));
      memberStatusMap.set(member.discordId, hasValidRole ? "active" : "former");
    }
  }

  if (debug) {
    logDebug("[members-page] Discord statuses from DB mirror", {
      total: enriched.filter((m) => m.discordId).length,
      active: Array.from(memberStatusMap.values()).filter((s) => s === "active").length,
      former: Array.from(memberStatusMap.values()).filter((s) => s === "former").length,
      notFound: Array.from(memberStatusMap.values()).filter((s) => s === "not-found").length,
      unavailable: Array.from(memberStatusMap.values()).filter((s) => s === "unavailable").length,
      unknown: Array.from(memberStatusMap.values()).filter((s) => s === "unknown").length,
    });
  }

  // 📝 Persist any rankLabel/gradeLevel changes back to database
  // This ensures future page loads have correct sort order
  const updates = enriched
    .filter((m) => m.rankLabel && (m.rankLabel !== m.rankLabel || m.gradeLevel !== members.find(orig => orig.id === m.id)?.gradeLevel))
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

    return {
      ...m,
      joinedAt: m.joinedAt?.toISOString() ?? null,
      updatedAt: m.updatedAt.toISOString(),
      memberStatus: (m.discordId ? memberStatusMap.get(m.discordId) ?? "unavailable" : "unavailable") as MemberStatus,
      effectiveActive, // ✅ Use for filtering/sorting instead of isActive
      isSessionUser,   // ✅ For client-side pinning at top
    };
  });

  return <MembersListClient members={data} bootstrap={bootstrap} debug={debug} sessionDiscordId={sessionDiscordId} />;
}


