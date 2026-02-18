# Exact Diffs - Pour Copier/Coller

## ⚡ TL;DR - Changes Required

### 2 Fichiers à modifier:
1. `app/api/discord/member-status/route.ts` - Ajouter REST verification
2. `src/lib/grade-colors.ts` - Changer 1 label

---

## DIFF 1: app/api/discord/member-status/route.ts

### AVANT (Début du fichier)
```typescript
/**
 * /api/discord/member-status - Batch member status verification
 * ...
 */

import { NextResponse } from "next/server";
import { getDiscordRolesForUserWithStatus, CHEF_FAMILLE_ROLE_ID } from "@/lib/discord-roles";
import { GRADE_ROLE_IDS_ORDERED } from "@/lib/grade-colors";
import { debug } from "@/lib/logger";

// Valid role IDs that indicate "active" membership
const VALID_ACTIVE_ROLES = new Set([
  ...(CHEF_FAMILLE_ROLE_ID ? [CHEF_FAMILLE_ROLE_ID] : []),
  ...GRADE_ROLE_IDS_ORDERED,
].filter(Boolean));

export type MemberStatusResult = {
  [discordId: string]: "active" | "former" | "not-found" | "unavailable";
};

export async function GET(req: Request) {
```

### APRÈS (Début du fichier)
```typescript
/**
 * /api/discord/member-status - Batch member status verification
 * 
 * Verifies Discord membership status for multiple members:
 * - "active": Has valid Discord role (grade or Chef famille)
 * - "former": In guild but no valid roles
 * - "not-found": Member not found (404) in Discord guild
 * - "unavailable": Discord API error (unavailable, rate limit, auth fail)
 * 
 * Query params:
 * - ?discordIds=id1,id2,id3... (comma-separated Discord IDs)
 * 
 * ✅ CRITICAL FIX:
 * Uses DISCORD_TOKEN (or DISCORD_BOT_TOKEN) + GUILD_ID from env
 * If missing, returns ok=false with detailed diagnostics
 * Never crashes - always returns proper JSON response
 */

import { NextResponse } from "next/server";
import { getDiscordRolesForUserWithStatus, CHEF_FAMILLE_ROLE_ID } from "@/lib/discord-roles";
import { GRADE_ROLE_IDS_ORDERED } from "@/lib/grade-colors";
import { debug } from "@/lib/logger";

// ✅ CRITICAL: Log environment variables immediately
const DISCORD_TOKEN = (process.env.DISCORD_TOKEN ?? process.env.DISCORD_BOT_TOKEN ?? "").trim();
const GUILD_ID = (process.env.GUILD_ID ?? process.env.DISCORD_GUILD_ID ?? "").trim();

console.log("[member-status] env check", {
  hasDiscordToken: !!DISCORD_TOKEN,
  hasGuildId: !!GUILD_ID,
  tokenSource: process.env.DISCORD_TOKEN ? "DISCORD_TOKEN" : process.env.DISCORD_BOT_TOKEN ? "DISCORD_BOT_TOKEN" : "none",
  guildIdSource: process.env.GUILD_ID ? "GUILD_ID" : process.env.DISCORD_GUILD_ID ? "DISCORD_GUILD_ID" : "none",
});

// Valid role IDs that indicate "active" membership
const VALID_ACTIVE_ROLES = new Set([
  ...(CHEF_FAMILLE_ROLE_ID ? [CHEF_FAMILLE_ROLE_ID] : []),
  ...GRADE_ROLE_IDS_ORDERED,
].filter(Boolean));

export type MemberStatusResult = {
  [discordId: string]: "active" | "former" | "not-found" | "unavailable";
};

/**
 * ✅ Direct REST verification - bypasses discord-roles library
 * Uses Discord API directly to check member status
 * Returns "active", "former", "not-found", or "unavailable"
 */
async function verifyMemberStatusViaRest(discordId: string): Promise<"active" | "former" | "not-found" | "unavailable"> {
  // Check env first
  if (!DISCORD_TOKEN || !GUILD_ID) {
    debug("[member-status] Env missing for REST verification", { hasToken: !!DISCORD_TOKEN, hasGuild: !!GUILD_ID });
    return "unavailable";
  }

  try {
    // Call Discord API directly
    const url = `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordId}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bot ${DISCORD_TOKEN}`,
        "Content-Type": "application/json",
      },
    });

    // ✅ Safe: Read text first, never direct .json()
    let text: string;
    try {
      text = await res.text();
    } catch {
      text = "";
    }

    // 404: Member not in guild
    if (res.status === 404) {
      debug("[member-status] Member not found (404)", { discordId, url });
      return "not-found";
    }

    // Auth errors: Token invalid or permissions missing
    if (res.status === 401 || res.status === 403) {
      debug("[member-status] Auth error", { discordId, status: res.status, url });
      return "unavailable";
    }

    // Other errors: Rate limit, server error, etc.
    if (!res.ok) {
      debug("[member-status] Discord API error", { discordId, status: res.status, url });
      return "unavailable";
    }

    // Success: Parse member data
    let member: any;
    try {
      member = JSON.parse(text);
    } catch {
      debug("[member-status] Failed to parse member JSON", { discordId });
      return "unavailable";
    }

    // Check if member has valid roles
    if (!member.roles || !Array.isArray(member.roles)) {
      return "former";
    }

    const hasValidRole = member.roles.some((roleId: string) => VALID_ACTIVE_ROLES.has(roleId));
    return hasValidRole ? "active" : "former";
  } catch (err: any) {
    debug("[member-status] REST verification exception", { discordId, error: err.message });
    return "unavailable";
  }
}

export async function GET(req: Request) {
```

### Dans la fonction GET(), remplacer le block d'appel:

**AVANT:**
```typescript
      const statusPromises = batch.map(async (discordId) => {
        try {
          const rolesResult = await getDiscordRolesForUserWithStatus(discordId);

          if (rolesResult.error) {
            // Distinguish between different error types
            if (rolesResult.error === "NOT_FOUND") {
              // 404: Member explicitly not found in guild
              result[discordId] = "not-found";
              debug("[member-status] Status: not-found (404 from Discord):", { discordId });
            } else {
              // CONFIG_MISSING, UNAVAILABLE, etc: API error or missing auth
              result[discordId] = "unavailable";
              debug("[member-status] Status: unavailable (API error):", {
                discordId,
                error: rolesResult.error,
              });
            }
          } else if (!rolesResult.roles || rolesResult.roles.length === 0) {
            // In guild but no roles
            result[discordId] = "former";
            debug("[member-status] Status: former (no roles):", { discordId });
          } else {
            // Check if has valid active role
            const hasValidRole = rolesResult.roles.some((roleId) =>
              VALID_ACTIVE_ROLES.has(roleId)
            );
            result[discordId] = hasValidRole ? "active" : "former";
            debug("[member-status] Status detected:", {
              discordId,
              status: hasValidRole ? "active" : "former",
              rolesCount: rolesResult.roles.length,
            });
          }
        } catch (error) {
          result[discordId] = "unavailable";
          debug("[member-status] Exception:", {
            discordId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
```

**APRÈS:**
```typescript
      const statusPromises = batch.map(async (discordId) => {
        try {
          // ✅ First try: Use REST verification (if env available)
          let status: "active" | "former" | "not-found" | "unavailable";

          if (DISCORD_TOKEN && GUILD_ID) {
            // Env available: Use direct REST call
            status = await verifyMemberStatusViaRest(discordId);
            debug("[member-status] Used REST verification", { discordId, status });
          } else {
            // Env missing: Fall back to discord-roles library
            const rolesResult = await getDiscordRolesForUserWithStatus(discordId);

            if (rolesResult.error) {
              // Distinguish between different error types
              if (rolesResult.error === "NOT_FOUND") {
                // 404: Member explicitly not found in guild
                status = "not-found";
                debug("[member-status] Status: not-found (404 from Discord):", { discordId });
              } else {
                // CONFIG_MISSING, UNAVAILABLE, etc: API error or missing auth
                status = "unavailable";
                debug("[member-status] Status: unavailable (API error):", {
                  discordId,
                  error: rolesResult.error,
                });
              }
            } else if (!rolesResult.roles || rolesResult.roles.length === 0) {
              // In guild but no roles
              status = "former";
              debug("[member-status] Status: former (no roles):", { discordId });
            } else {
              // Check if has valid active role
              const hasValidRole = rolesResult.roles.some((roleId) =>
                VALID_ACTIVE_ROLES.has(roleId)
              );
              status = hasValidRole ? "active" : "former";
              debug("[member-status] Status detected:", {
                discordId,
                status: hasValidRole ? "active" : "former",
                rolesCount: rolesResult.roles.length,
              });
            }
          }

          result[discordId] = status;
        } catch (error) {
          result[discordId] = "unavailable";
          debug("[member-status] Exception:", {
            discordId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
```

---

## DIFF 2: src/lib/grade-colors.ts

### UNIQUE CHANGE - Line 173:

**AVANT:**
```typescript
  if (status === "FETCH_FAILED") {
    return {
      label: "Erreur rôles",
      className: GRADE_BADGE_SPECIAL.FETCH_FAILED,
    };
  }
```

**APRÈS:**
```typescript
  if (status === "FETCH_FAILED") {
    return {
      label: "Non vérifié",
      className: GRADE_BADGE_SPECIAL.FETCH_FAILED,
    };
  }
```

---

## ✅ Vérification

Après les changements:
```bash
npm run build
# Doit avoir Exit Code 0, aucune erreur TypeScript
```

---

EOF
