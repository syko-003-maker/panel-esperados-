/**
 * Discord Role Sync Job
 * Syncs member grades from DB to Discord roles
 * Source of truth: Prisma DB (MemberProfile)
 */

import { Client, type GuildMember, type Role } from "discord.js";
import { IDS } from "./ids.js";
import { safeFetchMember, validateDiscordId } from "./utils/validateDiscordId.js";

// ─────────────────────────────────────────────────────────────
// Configuration (fetched from Panel or env)
// ─────────────────────────────────────────────────────────────

type RoleConfig = {
  gradeToRole: Record<string, string>;
  managedRoleIds: string[];
  protectedRoleIds: string[];
};

// Default config from env (fallback if API not available)
const DEFAULT_GRADE_TO_ROLE: Record<string, string> = {
  WL1: process.env.DISCORD_ROLE_WL1 ?? "",
  WL2: process.env.DISCORD_ROLE_WL2 ?? "",
  WL3: process.env.DISCORD_ROLE_WL3 ?? "",
  WL4: process.env.DISCORD_ROLE_WL4 ?? "",
  OFFICER: process.env.DISCORD_ROLE_OFFICER ?? "",
  CAPTAIN: process.env.DISCORD_ROLE_CAPTAIN ?? "",
  CHEF: process.env.DISCORD_ROLE_CHEF ?? "",
};

const DEFAULT_PROTECTED_ROLES = (process.env.DISCORD_PROTECTED_ROLES ?? "")
  .split(",")
  .filter(Boolean);

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type MemberData = {
  discordId: string;
  grade: string | null;
  gradeLevel: number;
  roleDiscordId: string | null;
  isActive: boolean;
  rpName: string | null;
};

type SyncResult = {
  total: number;
  synced: number;
  skipped: number;
  errors: number;
  changes: Array<{
    discordId: string;
    rpName: string | null;
    added: string[];
    removed: string[];
  }>;
};

// ─────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────

function log(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({
    event,
    ...data,
    timestamp: new Date().toISOString(),
  }));
}

// ─────────────────────────────────────────────────────────────
// Fetch from Panel
// ─────────────────────────────────────────────────────────────

async function fetchMembersFromPanel(): Promise<MemberData[]> {
  const baseUrl = IDS.PANEL_BASE_URL;
  const secret = process.env.DISCORD_WORKER_SECRET ?? process.env.INGEST_SECRET;

  if (!baseUrl || !secret) {
    log("sync_config_error", { error: "Missing PANEL_BASE_URL or secret" });
    return [];
  }

  try {
    const res = await fetch(`${baseUrl}/api/discord/members?activeOnly=true`, {
      headers: { "x-worker-secret": secret },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      log("sync_fetch_failed", { status: res.status, url: `${baseUrl}/api/discord/members` });
      return [];
    }

    const data = await res.json();
    if (!data.ok || !Array.isArray(data.members)) {
      log("sync_fetch_invalid", { ok: data.ok });
      return [];
    }

    return data.members as MemberData[];
  } catch (e) {
    log("sync_fetch_error", { error: e instanceof Error ? e.message : String(e) });
    return [];
  }
}

async function fetchRoleConfig(): Promise<RoleConfig> {
  const baseUrl = IDS.PANEL_BASE_URL;
  const secret = process.env.DISCORD_WORKER_SECRET ?? process.env.INGEST_SECRET;

  // Default config
  const defaultConfig: RoleConfig = {
    gradeToRole: DEFAULT_GRADE_TO_ROLE,
    managedRoleIds: Object.values(DEFAULT_GRADE_TO_ROLE).filter(Boolean),
    protectedRoleIds: DEFAULT_PROTECTED_ROLES,
  };

  if (!baseUrl || !secret) {
    return defaultConfig;
  }

  try {
    const res = await fetch(`${baseUrl}/api/discord/roles`, {
      headers: { "x-worker-secret": secret },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      return defaultConfig;
    }

    const data = await res.json();
    if (!data.ok) {
      return defaultConfig;
    }

    return {
      gradeToRole: data.gradeToRole ?? defaultConfig.gradeToRole,
      managedRoleIds: data.managedRoleIds ?? defaultConfig.managedRoleIds,
      protectedRoleIds: data.protectedRoleIds ?? defaultConfig.protectedRoleIds,
    };
  } catch {
    return defaultConfig;
  }
}

// ─────────────────────────────────────────────────────────────
// Sync Logic
// ─────────────────────────────────────────────────────────────

export async function syncMemberRoles(client: Client): Promise<SyncResult> {
  const result: SyncResult = {
    total: 0,
    synced: 0,
    skipped: 0,
    errors: 0,
    changes: [],
  };

  // Fetch guild
  const guild = await client.guilds.fetch(IDS.GUILD_ID).catch(() => null);
  if (!guild) {
    log("sync_guild_not_found", { guildId: IDS.GUILD_ID });
    return result;
  }

  // Fetch members and config
  const [members, config] = await Promise.all([
    fetchMembersFromPanel(),
    fetchRoleConfig(),
  ]);

  if (members.length === 0) {
    log("sync_no_members");
    return result;
  }

  result.total = members.length;

  const { gradeToRole, managedRoleIds, protectedRoleIds } = config;
  const managedSet = new Set(managedRoleIds);
  const protectedSet = new Set(protectedRoleIds);

  // Process each member
  for (const member of members) {
    // Skip inactive members
    if (!member.isActive) {
      result.skipped++;
      continue;
    }

    try {
      // ✅ Validate discordId before fetching
      const validation = validateDiscordId(member.discordId);
      if (!validation.valid) {
        console.warn(`[syncRoles] Invalid discordId for member ${member.rpName || member.discordId}:`, validation.error);
        result.skipped++;
        continue;
      }
      
      // Fetch guild member with force refresh
      const guildMember = await safeFetchMember(guild, validation.discordId, "syncRoles");
      if (!guildMember) {
        // Member not in guild (error code 10007)
        result.skipped++;
        continue;
      }

      // Determine target role
      const targetRoleId = member.grade ? gradeToRole[member.grade.toUpperCase()] : null;
      const currentRoles = guildMember.roles.cache;

      // Calculate changes
      const rolesToAdd: string[] = [];
      const rolesToRemove: string[] = [];

      // Add target role if not present
      if (targetRoleId && !currentRoles.has(targetRoleId)) {
        rolesToAdd.push(targetRoleId);
      }

      // Remove other managed roles (except target and protected)
      for (const roleId of managedSet) {
        if (roleId !== targetRoleId && currentRoles.has(roleId)) {
          if (!protectedSet.has(roleId)) {
            rolesToRemove.push(roleId);
          }
        }
      }

      // Apply changes if any
      if (rolesToAdd.length > 0 || rolesToRemove.length > 0) {
        // Remove roles first
        for (const roleId of rolesToRemove) {
          await guildMember.roles.remove(roleId, `Grade sync: removing old grade role`);
        }

        // Add new role
        for (const roleId of rolesToAdd) {
          await guildMember.roles.add(roleId, `Grade sync: ${member.grade}`);
        }

        result.synced++;
        result.changes.push({
          discordId: member.discordId,
          rpName: member.rpName,
          added: rolesToAdd,
          removed: rolesToRemove,
        });

        log("sync_role_updated", {
          discordId: member.discordId,
          rpName: member.rpName,
          grade: member.grade,
          added: rolesToAdd,
          removed: rolesToRemove,
        });
      } else {
        result.skipped++;
      }
    } catch (e) {
      result.errors++;
      log("sync_member_error", {
        discordId: member.discordId,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export async function runRoleSync(client: Client): Promise<void> {
  log("sync_start");

  try {
    const result = await syncMemberRoles(client);

    log("sync_complete", {
      total: result.total,
      synced: result.synced,
      skipped: result.skipped,
      errors: result.errors,
    });
  } catch (e) {
    log("sync_error", { error: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * Manual sync (for slash command)
 */
export async function runManualSync(client: Client): Promise<SyncResult> {
  log("sync_manual_start");

  const result = await syncMemberRoles(client);

  log("sync_manual_complete", {
    total: result.total,
    synced: result.synced,
    skipped: result.skipped,
    errors: result.errors,
  });

  return result;
}
