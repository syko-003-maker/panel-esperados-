/**
 * Discord Member Activity Verification
 * 
 * Checks if a member is still active on Discord based on:
 * 1. Presence in guild (member still exists)
 * 2. Possession of required role (family role OR grade role)
 */

import { getDiscordRolesForUserWithStatus, CHEF_FAMILLE_ROLE_ID, SOUS_CHEF_FAMILLE_ROLE_ID } from "@/lib/discord-roles";
import { debug } from "@/lib/logger";

// Grade role IDs from grade-colors system
const GRADE_ROLE_IDS = [
  "1312845999739375710", // Général
  "1312845999366209686", // Consejero
  "1312845999366209685", // Comandante
  "1312845999366209684", // Coronel
  "1408485173527445627", // Mayor
  "1312845999366209681", // Capitan
  "1312845999366209680", // Teniente
  "1312845999366209679", // Subteniente
  "1312845999366209678", // Veterano
  "1312845999366209677", // Caporal
  "1312845999340781649", // Asesino
  "1312845999340781648", // Guardia
  "1312845999340781647", // Soldato
  "1408492476351778836", // Novato
  "1312845999366209682", // Réserviste
];

// Family role ID
const FAMILY_ROLE_ID = process.env.DISCORD_FAMILY_ROLE_ID ?? ""; // Los Esperados

// All valid active roles
const VALID_ACTIVE_ROLES = [
  ...(FAMILY_ROLE_ID ? [FAMILY_ROLE_ID] : []),
  ...(CHEF_FAMILLE_ROLE_ID ? [CHEF_FAMILLE_ROLE_ID] : []),
  ...(SOUS_CHEF_FAMILLE_ROLE_ID ? [SOUS_CHEF_FAMILLE_ROLE_ID] : []),
  ...GRADE_ROLE_IDS.filter(Boolean),
];

/**
 * Check if a member is active on Discord
 * 
 * Returns:
 * - true: Member is in guild AND has a valid role (family, chef, or grade)
 * - false: Member not in guild OR doesn't have any valid role
 * - null: Unable to determine (API error)
 * 
 * @param discordId - Member's Discord ID
 * @param guildId - Guild ID (defaults to env DISCORD_GUILD_ID)
 */
export async function isActiveMemberOnDiscord(
  discordId: string,
  guildId?: string
): Promise<boolean | null> {
  if (!discordId) {
    debug("[member-activity] isActiveMemberOnDiscord: missing discordId");
    return null;
  }

  try {
    const rolesResult = await getDiscordRolesForUserWithStatus(discordId, guildId);

    // If error, we can't determine activity
    if (rolesResult.error === "CONFIG_MISSING" || rolesResult.error === "UNAVAILABLE") {
      debug("[member-activity] isActiveMemberOnDiscord: API unavailable", {
        discordId,
        error: rolesResult.error,
      });
      return null; // Can't determine, don't change anything
    }

    // Check if member has any valid active role
    const memberRoles = rolesResult.roles || [];
    const hasValidRole = memberRoles.some((roleId) => VALID_ACTIVE_ROLES.includes(roleId));

    const isActive = hasValidRole;

    debug("[member-activity] isActiveMemberOnDiscord", {
      discordId,
      memberRoles: memberRoles.slice(0, 5), // Log first 5 for brevity
      hasValidRole,
      isActive,
    });

    return isActive;
  } catch (error) {
    debug("[member-activity] isActiveMemberOnDiscord: exception", {
      discordId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null; // On error, can't determine
  }
}

/**
 * Batch check discord activity for multiple members
 * Returns map of discordId -> boolean or null
 */
export async function checkBatchDiscordActivity(
  discordIds: string[],
  guildId?: string
): Promise<Map<string, boolean | null>> {
  const results = new Map<string, boolean | null>();

  // Check in parallel with concurrency limit (5 at a time to avoid rate limits)
  const CONCURRENCY = 5;
  for (let i = 0; i < discordIds.length; i += CONCURRENCY) {
    const batch = discordIds.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((id) => isActiveMemberOnDiscord(id, guildId))
    );

    batch.forEach((discordId, idx) => {
      results.set(discordId, batchResults[idx]);
    });
  }

  return results;
}
