import { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } from "discord.js";
import { IDS } from "./ids.js";
import { safeRoleMention } from "./mentions.js";
/**
 * Post a link request message to the bots-famille channel
 */
export async function postLinkRequestMessage(client, data) {
    const { requestId, discordId, username } = data;
    const channel = await client.channels.fetch(IDS.BOTS_FAMILLE_CHANNEL_ID);
    if (!channel || !channel.isTextBased() || channel.isDMBased()) {
        throw new Error("Channel not found or not text-based");
    }
    const textChannel = channel;
    const embed = new EmbedBuilder()
        .setColor(0x3b82f6) // Blue
        .setTitle("📝 Nouvelle demande de liaison")
        .setDescription(`**Utilisateur:** <@${discordId}> (${username})`)
        .addFields({ name: "Discord ID", value: discordId, inline: true }, { name: "Statut", value: "⏳ En attente", inline: true }, { name: "ID Demande", value: `#${requestId}`, inline: true })
        .setTimestamp()
        .setFooter({ text: "Demande de liaison Los Esperados" });
    const buttons = new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setCustomId(`linkreq:open:${requestId}:${discordId}`)
        .setLabel("Accepter")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅"), new ButtonBuilder()
        .setCustomId(`linkreq:refuse:${requestId}:${discordId}`)
        .setLabel("Refuser")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("❌"), new ButtonBuilder()
        .setCustomId(`linkreq:archive:${requestId}:${discordId}`)
        .setLabel("Archiver")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("📦"));
    const guild = client.guilds.cache.get(IDS.GUILD_ID) ?? await client.guilds.fetch(IDS.GUILD_ID).catch(() => null);
    const rolePings = [
        safeRoleMention(guild, IDS.RECRUTEUR_ROLE_ID, "(rôle recruteur)"),
        safeRoleMention(guild, IDS.ETAT_MAJOR_ROLE_ID, "(rôle état-major)"),
        safeRoleMention(guild, IDS.CHEF_FAMILLE_ROLE_ID, "(rôle chef-famille)"),
    ].filter(Boolean).join(" ");
    const message = await textChannel.send({
        content: `${rolePings}\n\n🔔 **Nouvelle demande de liaison**`,
        embeds: [embed],
        components: [buttons],
    });
    console.log("[link-request:posted]", {
        requestId,
        messageId: message.id,
        channelId: textChannel.id,
        discordId,
        timestamp: new Date().toISOString(),
    });
    return { messageId: message.id };
}
