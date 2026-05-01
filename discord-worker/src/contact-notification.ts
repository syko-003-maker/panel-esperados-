/**
 * Simple Contact Notification System
 * 
 * Envoyé par le site quand un user non-lié clique "Contacter le staff"
 * Envoie une notification simple dans BOTS_FAMILLE_CHANNEL_ID
 * 
 * Pinged:
 * - Recruteur 1312845999215214618
 * - Chef famille 1429607761720770623
 * - Etat Major 1312845999366209683
 */

import { Client, EmbedBuilder, ChannelType } from "discord.js";
import { IDS } from "./ids.js";
import { safeRoleMention } from "./mentions.js";

function log(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({
    event,
    ...data,
    timestamp: new Date().toISOString(),
  }));
}

/**
 * Envoyer une notification de contact simple au staff
 * @param client Discord client
 * @param userData Infos du user qui demande contact
 */
export async function sendContactNotification(
  client: Client,
  userData: {
    discordId: string;
    username: string;
    steamId?: string;
    rpName?: string;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const channel = await client.channels.fetch(IDS.BOTS_FAMILLE_CHANNEL_ID);
    if (!channel || channel.type !== ChannelType.GuildText) {
      return { ok: false, error: "BOTS_FAMILLE_CHANNEL_ID not found or not a text channel" };
    }

    const embed = new EmbedBuilder()
      .setTitle("📞 Demande de Contact")
      .setDescription(`Un joueur souhaite contacter le staff`)
      .addFields(
        {
          name: "Discord",
          value: `<@${userData.discordId}> (${userData.username})`,
          inline: true,
        },
        {
          name: "Discord ID",
          value: userData.discordId,
          inline: true,
        },
        ...(userData.steamId ? [{
          name: "Steam ID",
          value: userData.steamId,
          inline: true,
        }] : []),
        ...(userData.rpName ? [{
          name: "RP Name",
          value: userData.rpName,
          inline: true,
        }] : [])
      )
      .setColor(0xffa500) // Orange
      .setTimestamp();

    const guild = client.guilds.cache.get(IDS.GUILD_ID) ?? await client.guilds.fetch(IDS.GUILD_ID).catch(() => null);
    const mentions = [
      safeRoleMention(guild, IDS.RECRUTEUR_ROLE_ID, "(rôle recruteur)"),
      safeRoleMention(guild, IDS.CHEF_FAMILLE_ROLE_ID, "(rôle chef-famille)"),
      safeRoleMention(guild, IDS.SOUS_CHEF_FAMILLE_ROLE_ID, "(rôle sous-chef-famille)"),
      safeRoleMention(guild, IDS.ETAT_MAJOR_ROLE_ID, "(rôle état-major)"),
    ].filter(Boolean).join(" ");

    await channel.send({
      content: mentions,
      embeds: [embed],
    });

    log("contact_notification_sent", {
      discordId: userData.discordId,
      username: userData.username,
      channel: IDS.BOTS_FAMILLE_CHANNEL_ID,
    });

    return { ok: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log("contact_notification_failed", {
      error: message,
      discordId: userData.discordId,
    });
    return { ok: false, error: message };
  }
}
