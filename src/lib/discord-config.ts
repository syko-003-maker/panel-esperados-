/**
 * Centralized Discord configuration
 * All Discord-related IDs and URLs should be generated from here
 */

// Discord Guild ID
export const DISCORD_GUILD_ID = process.env.NEXT_PUBLIC_DISCORD_GUILD_ID ?? "";

// Channel IDs (used for link generation on panel side)
export const DISCORD_CHANNELS = {
  CONTACT: process.env.CONTACT_CHANNEL_ID ?? "",
  TICKETS_PARENT: process.env.TICKETS_PARENT_CHANNEL_ID ?? "",
  TICKETS_LOGS: process.env.TICKETS_LOGS_CHANNEL_ID ?? "",
} as const;


/**
 * Generate Discord thread URL
 */
export function getDiscordThreadUrl(threadId: string): string {
  if (!DISCORD_GUILD_ID) {
    return `https://discord.com/channels/@me/${threadId}`;
  }
  return `https://discord.com/channels/${DISCORD_GUILD_ID}/${threadId}`;
}

/**
 * Generate Discord channel URL
 */
export function getDiscordChannelUrl(channelId: string): string {
  if (!DISCORD_GUILD_ID) {
    return `https://discord.com/channels/@me/${channelId}`;
  }
  return `https://discord.com/channels/${DISCORD_GUILD_ID}/${channelId}`;
}

/**
 * Check if Discord config is properly set
 */
export function isDiscordConfigured(): boolean {
  return !!DISCORD_GUILD_ID;
}
