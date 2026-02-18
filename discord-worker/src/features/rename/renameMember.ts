/**
 * Discord Member Rename Handler
 * Attempts to rename a member on Discord with proper permissions checks
 * and detailed logging for debugging
 */

import type { Client, Guild, GuildMember } from "discord.js";
import { PermissionFlagsBits } from "discord.js";
import { buildNickname } from "./rules.js";
import { safeFetchMember, validateDiscordId } from "../../utils/validateDiscordId.js";

/**
 * Result of a rename attempt
 */
export interface RenameResult {
  ok: boolean;
  nickname?: string; // The nickname that was/would be set (if ok: true)
  skipped?: string; // Reason if skipped (NO_RPNAME | ALREADY_OK | NO_PERMISSION | ROLE_HIERARCHY | MEMBER_NOT_FOUND)
  error?: string; // Error message if failed
  botHasPermission?: boolean; // Whether bot has ManageNicknames permission
  botRoleHigher?: boolean; // Whether bot's role is higher than member's
}

/**
 * Attempt to rename a Discord member if possible
 *
 * @param client Discord.js Client
 * @param guildId Guild ID where member should be renamed
 * @param discordId Member's Discord ID to rename
 * @param rpName The rpName to use as nickname
 * @param reason Audit log reason (optional)
 * @returns Result object with ok status and details
 */
export async function renameMemberIfPossible(
  client: Client,
  guildId: string,
  discordId: string,
  rpName: string | null | undefined,
  reason?: string
): Promise<RenameResult> {
  try {
    // Build desired nickname from rpName
    const nickname = buildNickname({ rpName });

    // If no valid rpName, skip
    if (!nickname) {
      return {
        ok: false,
        skipped: "NO_RPNAME",
      };
    }

    // Fetch guild
    let guild: Guild;
    try {
      guild = await client.guilds.fetch(guildId);
    } catch (e) {
      return {
        ok: false,
        error: `Guild not found: ${guildId}`,
      };
    }

    // Check bot permissions
    const botMember = await guild.members.fetchMe();
    const hasManageNicknames = botMember.permissions.has(PermissionFlagsBits.ManageNicknames);

    if (!hasManageNicknames) {
      return {
        ok: false,
        skipped: "NO_PERMISSION",
        botHasPermission: false,
        error: "Bot missing ManageNicknames permission",
      };
    }

    // ✅ Validate and fetch target member
    const validation = validateDiscordId(discordId);
    if (!validation.valid) {
      return {
        ok: false,
        skipped: "INVALID_DISCORD_ID",
        error: validation.error || "Invalid Discord ID format",
      };
    }
    
    let member: GuildMember;
    try {
      const fetched = await safeFetchMember(guild, validation.discordId, "renameMember");
      if (!fetched) {
        return {
          ok: false,
          skipped: "MEMBER_NOT_FOUND",
          error: `Member not found in guild: ${validation.discordId} (error code 10007)`,
        };
      }
      member = fetched;
    } catch (e) {
      return {
        ok: false,
        skipped: "MEMBER_NOT_FOUND",
        error: `Member fetch failed: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    // Check role hierarchy (bot must be higher than target)
    if (botMember.roles.highest.comparePositionTo(member.roles.highest) <= 0) {
      return {
        ok: false,
        skipped: "ROLE_HIERARCHY",
        botRoleHigher: false,
        error: "Bot role not higher than member role (Discord restriction)",
      };
    }

    // Check if nickname is already set correctly
    if (member.nickname === nickname) {
      return {
        ok: true,
        nickname,
        skipped: "ALREADY_OK",
      };
    }

    // Attempt to set nickname
    await member.setNickname(nickname, reason || "Auto-rename from panel");

    return {
      ok: true,
      nickname,
    };
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      error: errorMsg,
    };
  }
}

/**
 * Format a RenameResult for user-friendly output
 * Used in Discord commands and responses
 *
 * @param result The result object
 * @param rpName The rpName that was attempted
 * @returns Human-readable message
 */
export function formatRenameResult(result: RenameResult, rpName: string | null): string {
  if (result.ok && !result.skipped) {
    return `✅ Renommé en **${result.nickname}**`;
  }

  if (result.skipped === "NO_RPNAME") {
    return "⚠️ Pas de nom RP (rpName vide)";
  }

  if (result.skipped === "ALREADY_OK") {
    return `✅ Déjà renommé en **${result.nickname}**`;
  }

  if (result.skipped === "NO_PERMISSION") {
    return "⚠️ Bot ne peut pas renommer (permission ManageNicknames manquante)";
  }

  if (result.skipped === "ROLE_HIERARCHY") {
    return "⚠️ Impossible de renommer: le rôle du bot n'est pas assez haut";
  }

  if (result.skipped === "MEMBER_NOT_FOUND") {
    return "⚠️ Membre non trouvé sur le serveur";
  }

  return `❌ Erreur: ${result.error || "Unknown error"}`;
}
