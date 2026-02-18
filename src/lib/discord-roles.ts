import { debug, error, warn } from "@/lib/logger";
import { getStaffRoleIds } from "@/lib/discord-rbac";

const ROLE_ID_REGEX = /^[0-9]{17,20}$/;

export type DiscordRoleResult = {
  roles: string[];
  error?: "CONFIG_MISSING" | "NOT_FOUND" | "UNAVAILABLE";
};

const DEFAULT_ROLE_IDS = {
  CHEF_FAMILLE_ROLE_ID: "1429607761720770623",
  ETAT_MAJOR_ROLE_ID: "1312845999366209683",
  RECRUTEUR_ROLE_ID: "1312845999215214618",
} as const;

// ─────────────────────────────────────────────────────────────
// Helper: Parse comma-separated role IDs from environment variables
// ─────────────────────────────────────────────────────────────
function parseRoleIds(envVarName: string): string[] {
  const envValue = (process.env[envVarName] ?? "").trim();
  if (!envValue) return [];

  return envValue
    .split(",")
    .map((id) => id.trim())
    .filter((id) => isValidRoleId(id));
}

let roleConfigLogged = false;

// In-memory cache for Discord roles
type RoleCacheEntry = {
  roles: string[];
  expiresAt: number;
};

const roleCache = new Map<string, RoleCacheEntry>();
const inflightRequests = new Map<string, Promise<DiscordRoleResult>>();
const cooldownUntil = new Map<string, number>();

function clampMs(value: number, minMs: number, maxMs: number) {
  if (!Number.isFinite(value)) return minMs;
  return Math.min(Math.max(value, minMs), maxMs);
}

const CACHE_TTL_MS = clampMs(
  Number(process.env.DISCORD_ROLE_CACHE_TTL_MS ?? "300000"),
  60_000,
  300_000
);
const COOLDOWN_MS = clampMs(
  Number(process.env.DISCORD_ROLE_COOLDOWN_MS ?? "60000"),
  30_000,
  300_000
);

// ─────────────────────────────────────────────────────────────
// Guild Members Map Cache (60s TTL)
// Stores all guild members and their roles for efficient lookup
// ─────────────────────────────────────────────────────────────
type GuildMembersMapCache = {
  members: Map<string, string[]>; // discordId -> roleIds[]
  expiresAt: number;
};

const GUILD_MEMBERS_CACHE_TTL_MS = 60_000; // 60 seconds
const guildMembersCache = new Map<string, GuildMembersMapCache>(); // guildId -> cache
let guildMembersInflightRequests = new Map<string, Promise<Map<string, string[]> | null>>();

// Prevent Discord API calls ONLY during actual build phase
// Do NOT skip during runtime even if missing BOT_TOKEN - let it fail gracefully
const isBuildTime = process.env.NEXT_PHASE === "phase-production-build";

export function isValidRoleId(value?: string | null): boolean {
  return typeof value === "string" && ROLE_ID_REGEX.test(value.trim());
}

function normalizeRoleId(value: string | undefined, label: string): string {
  if (!value) {
    return "";
  }
  const trimmed = value.trim();
  if (!ROLE_ID_REGEX.test(trimmed)) {
    warn("[discord-roles] roleId misconfigured", { label });
    return "";
  }
  return trimmed;
}

function resolveRoleId(label: keyof typeof DEFAULT_ROLE_IDS, envValue?: string): string {
  const normalizedEnv = normalizeRoleId(envValue, label);
  if (normalizedEnv) return normalizedEnv;

  const fallback = DEFAULT_ROLE_IDS[label];
  if (!ROLE_ID_REGEX.test(fallback)) {
    warn("[discord-roles] roleId misconfigured", { label });
    return "";
  }
  return fallback;
}

export const CHEF_FAMILLE_ROLE_ID = resolveRoleId(
  "CHEF_FAMILLE_ROLE_ID",
  process.env.CHEF_FAMILLE_ROLE_ID
);
export const ETAT_MAJOR_ROLE_ID = resolveRoleId(
  "ETAT_MAJOR_ROLE_ID",
  process.env.ETAT_MAJOR_ROLE_ID
);
export const RECRUTEUR_ROLE_ID = resolveRoleId(
  "RECRUTEUR_ROLE_ID",
  process.env.RECRUTEUR_ROLE_ID
);

const DISCORD_GUILD_ID = (process.env.DISCORD_GUILD_ID ?? "").trim();
const DISCORD_BOT_TOKEN = (process.env.DISCORD_BOT_TOKEN ?? "").trim();

export function logDiscordRoleConfig(context: string): void {
  if (roleConfigLogged) return;
  roleConfigLogged = true;
  debug("[discord-roles] config", {
    context,
    chefFamilleConfigured: Boolean(CHEF_FAMILLE_ROLE_ID),
    etatMajorConfigured: Boolean(ETAT_MAJOR_ROLE_ID),
    recruteurConfigured: Boolean(RECRUTEUR_ROLE_ID),
    guildConfigured: Boolean(DISCORD_GUILD_ID),
    botTokenConfigured: Boolean(DISCORD_BOT_TOKEN),
  });
}

/**
 * Fetch all guild members and build a Map<discordId, roleIds[]>
 * 
 * Paginates through Discord API with limit=1000 to get all members.
 * Returns null if API call fails (429, 5xx, timeout, etc.)
 * Returns Map if successful.
 * 
 * @param guildId - Discord guild ID
 * @returns Map<discordId, roleIds[]> or null if fetch failed
 */
async function fetchAllGuildMembers(guildId: string): Promise<Map<string, string[]> | null> {
  if (!guildId || !DISCORD_BOT_TOKEN) {
    debug("[discord-roles] fetchAllGuildMembers: missing guildId or BOT_TOKEN");
    return null;
  }

  try {
    const membersMap = new Map<string, string[]>();
    let afterId = "0"; // Start from beginning
    let morePages = true;
    let pageCount = 0;

    while (morePages) {
      pageCount++;
      const url = `https://discord.com/api/v10/guilds/${guildId}/members?limit=1000&after=${afterId}`;
      
      const res = await fetch(url, {
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        },
      });

      // Check rate limit
      if (res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        warn("[discord-roles] fetchAllGuildMembers: 429 rate limit hit", { retryAfter });
        return null; // Return null to indicate API error
      }

      // Check other errors
      if (!res.ok) {
        warn("[discord-roles] fetchAllGuildMembers: API error", { status: res.status, guildId });
        return null; // Return null to indicate API error
      }

      const members = (await res.json()) as Array<{ user?: { id: string }; roles: string[] }>;
      
      if (!Array.isArray(members) || members.length === 0) {
        morePages = false;
        continue;
      }

      // Add members to map
      for (const m of members) {
        if (m.user?.id && Array.isArray(m.roles)) {
          membersMap.set(m.user.id, m.roles);
        }
      }

      // If we got fewer than 1000, we're done
      if (members.length < 1000) {
        morePages = false;
      } else {
        // Continue from last member's ID
        const lastMember = members[members.length - 1];
        afterId = lastMember.user?.id || "0";
      }

      debug("[discord-roles] fetchAllGuildMembers: fetched page", { pageCount, memberCount: members.length });
    }

    debug("[discord-roles] fetchAllGuildMembers: complete", { totalMembers: membersMap.size, pageCount });
    return membersMap;
  } catch (err) {
    error("[discord-roles] fetchAllGuildMembers: exception", {
      error: err instanceof Error ? err.message : String(err),
      guildId,
    });
    return null; // Return null to indicate API error
  }
}

/**
 * Get Map of all guild members and their roles
 * Uses 60s cache to avoid hammering Discord API
 * 
 * Returns null if API call fails or times out
 * Returns Map<discordId, roleIds[]> if successful
 * 
 * @param guildId - Discord guild ID
 * @returns Map or null if fetch failed
 */
export async function getGuildMembersMap(guildId: string = DISCORD_GUILD_ID): Promise<Map<string, string[]> | null> {
  if (isBuildTime) return null;
  
  const now = Date.now();
  
  // Check cache
  const cached = guildMembersCache.get(guildId);
  if (cached && cached.expiresAt > now) {
    debug("[discord-roles] getGuildMembersMap: cache hit", { guildId, memberCount: cached.members.size });
    return cached.members;
  }

  // Check inflight request
  const inflight = guildMembersInflightRequests.get(guildId);
  if (inflight) {
    debug("[discord-roles] getGuildMembersMap: joining inflight request", { guildId });
    return inflight;
  }

  // Start new fetch
  const fetchPromise = (async () => {
    try {
      const result = await fetchAllGuildMembers(guildId);
      
      if (result) {
        // Cache successful result
        guildMembersCache.set(guildId, {
          members: result,
          expiresAt: now + GUILD_MEMBERS_CACHE_TTL_MS,
        });
      }
      
      return result; // null or Map
    } finally {
      guildMembersInflightRequests.delete(guildId);
    }
  })();

  guildMembersInflightRequests.set(guildId, fetchPromise);
  return fetchPromise;
}

export async function getDiscordRolesForUserWithStatus(
  discordId: string,
  guildId: string = DISCORD_GUILD_ID
): Promise<DiscordRoleResult> {
  // Skip API calls during build time
  if (isBuildTime) {
    return { roles: [] };
  }

  logDiscordRoleConfig("getDiscordRolesForUser");

  // Add detailed logging for debugging RBAC issues
  if (!discordId) {
    warn("[discord-roles] Missing discordId", { discordId });
    return { roles: [], error: "CONFIG_MISSING" };
  }

  if (!guildId) {
    error("[discord-roles] Missing DISCORD_GUILD_ID - role check will FAIL", { 
      discordId,
      envGuildId: Boolean(process.env.DISCORD_GUILD_ID),
      envGuildIdValue: process.env.DISCORD_GUILD_ID?.substring(0, 4) + "..." // Log prefix for privacy
    });
    return { roles: [], error: "CONFIG_MISSING" };
  }

  if (!DISCORD_BOT_TOKEN) {
    error("[discord-roles] Missing DISCORD_BOT_TOKEN - cannot fetch Discord roles", { discordId });
    return { roles: [], error: "CONFIG_MISSING" };
  }

  const cacheKey = `${guildId}:${discordId}`;
  const now = Date.now();

  // Check cache first
  const cached = roleCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    debug("[discord-roles] cache_hit", { discordId, ttlRemaining: cached.expiresAt - now });
    return { roles: cached.roles };
  }

  const cooldown = cooldownUntil.get(cacheKey);
  if (cooldown && cooldown > now) {
    debug("[discord-roles] cooldown_active", { discordId, cooldownRemaining: cooldown - now });
    return cached ? { roles: cached.roles } : { roles: [], error: "UNAVAILABLE" };
  }

  // Check if request is already in-flight
  const inflight = inflightRequests.get(cacheKey);
  if (inflight) {
    debug("[discord-roles] inflight_join", { discordId });
    return inflight;
  }

  // Start new fetch
  debug("[discord-roles] cache_miss", { discordId, hadStaleCache: Boolean(cached) });
  
  const fetchPromise: Promise<DiscordRoleResult> = (async (): Promise<DiscordRoleResult> => {
    try {
      const res = await fetch(
        `https://discord.com/api/v10/guilds/${guildId}/members/${discordId}`,
        {
          headers: {
            Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          },
        }
      );

      if (res.status === 404) {
        // Member not found in guild
        debug("[discord-roles] Member not found (404)", { discordId });
        return { roles: [], error: "NOT_FOUND" };
      }

      if (res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        warn("[discord-roles] Discord API 429 rate limit hit", { 
          discordId, 
          retryAfter: retryAfter ? `${retryAfter}s` : "unknown"
        });
        
        // Use stale cache if available
        if (cached) {
          warn("[discord-roles] discord_429_fallback_used", { discordId, cacheAge: now - (cached.expiresAt - CACHE_TTL_MS) });
          // Extend expiration to avoid hammering Discord
          roleCache.set(cacheKey, {
            roles: cached.roles,
            expiresAt: now + COOLDOWN_MS,
          });
          cooldownUntil.set(cacheKey, now + COOLDOWN_MS);
          return { roles: cached.roles };
        }
        
        // No cache available - fail safely
        error("[discord-roles] Discord 429 with no cached data, denying access", { discordId });
        cooldownUntil.set(cacheKey, now + COOLDOWN_MS);
        return { roles: [], error: "UNAVAILABLE" };
      }

      if (!res.ok) {
        warn("[discord-roles] Discord API error", {
          status: res.status,
          statusText: res.statusText,
          discordId,
        });
        
        // Use stale cache on any error if available
        if (cached) {
          warn("[discord-roles] Using stale cache due to API error", { discordId });
          return { roles: cached.roles };
        }
        
        return { roles: [], error: "UNAVAILABLE" };
      }

      const member = (await res.json()) as { roles?: string[] };
      const roles = Array.isArray(member.roles) ? member.roles : [];
      
      // Update cache
      roleCache.set(cacheKey, {
        roles,
        expiresAt: now + CACHE_TTL_MS,
      });
      
      debug("[discord-roles] Fetched and cached roles", { discordId, roleCount: roles.length });
      return { roles };
    } catch (err) {
      error("[discord-roles] Failed to fetch Discord roles", {
        error: err instanceof Error ? err.message : String(err),
        discordId,
      });
      
      // Use stale cache on exception if available
      if (cached) {
        warn("[discord-roles] Using stale cache due to exception", { discordId });
        return { roles: cached.roles };
      }
      
      return { roles: [], error: "UNAVAILABLE" };
    } finally {
      // Always remove from inflight map
      inflightRequests.delete(cacheKey);
    }
  })();

  // Store in inflight map
  inflightRequests.set(cacheKey, fetchPromise);
  
  return fetchPromise;
}

export async function getDiscordRolesForUser(
  discordId: string,
  guildId: string = DISCORD_GUILD_ID
): Promise<string[]> {
  const result = await getDiscordRolesForUserWithStatus(discordId, guildId);
  return result.roles;
}

export async function fetchDiscordMemberRoles(
  discordId: string,
  guildId: string = DISCORD_GUILD_ID
): Promise<string[]> {
  return getDiscordRolesForUser(discordId, guildId);
}

export function hasAnyRole(
  roles: string[],
  requiredRoleIds: Array<string | undefined | null>
): boolean {
  if (!Array.isArray(roles) || roles.length === 0) return false;

  const required = requiredRoleIds
    .filter((id): id is string => isValidRoleId(id))
    .map((id) => id.trim());

  if (required.length === 0) return false;

  return required.some((id) => roles.includes(id));
}

// ─────────────────────────────────────────────────────────────
// RBAC 2-Level Role Getters
// ─────────────────────────────────────────────────────────────

/**
 * Get recruiter role IDs from environment variable
 * Recruiters have access to /staff/recruitment only
 */
export function getRecruiterRoleIds(): string[] {
  return parseRoleIds("DISCORD_RECRUITER_ROLE_IDS");
}

/**
 * Get staff full role IDs from environment variable
 * Staff members have access to complete staff panel
 */
export function getStaffFullRoleIds(): string[] {
  return parseRoleIds("DISCORD_STAFF_FULL_ROLE_IDS");
}

/**
 * Check if user has recruiter role
 */
export function isRecruiter(roles: string[]): boolean {
  return hasAnyRole(roles, getRecruiterRoleIds());
}

/**
 * Check if user has staff full role
 */
export function isStaffFull(roles: string[]): boolean {
  return hasAnyRole(roles, getStaffFullRoleIds());
}

/**
 * Log RBAC configuration at startup (once only)
 */
export function logRbacConfiguration(): void {
  if (process.env.NODE_ENV !== "production" || process.env.DEBUG_RBAC === "true") {
    const recruiterRoles = getRecruiterRoleIds();
    const staffFullRoles = getStaffFullRoleIds();

    if (recruiterRoles.length > 0) {
      const formatted = recruiterRoles.map((id) => id.slice(-4)).join(", ");
      debug(`[discord-rbac] RECRUITER roles configured: ...${formatted}`);
    }

    if (staffFullRoles.length > 0) {
      const formatted = staffFullRoles.map((id) => id.slice(-4)).join(", ");
      debug(`[discord-rbac] STAFF_FULL roles configured: ...${formatted}`);
    }

    if (recruiterRoles.length === 0 && staffFullRoles.length === 0) {
      warn("[discord-rbac] No RBAC roles configured! Check DISCORD_RECRUITER_ROLE_IDS and DISCORD_STAFF_FULL_ROLE_IDS");
    }
  }
}
