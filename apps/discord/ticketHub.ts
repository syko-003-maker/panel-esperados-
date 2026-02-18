/**
 * Ticket HUB message management
 */

import {
  Client,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
} from "discord.js";

export async function ensureTicketHub(client: Client, hubChannelId: string): Promise<void> {
  if (!hubChannelId) {
    console.warn("[ticketHub] No hubChannelId provided, skipping HUB setup");
    return;
  }

  try {
    const channel = await client.channels.fetch(hubChannelId);

    if (!channel) {
      console.warn(`[ticketHub] Channel ${hubChannelId} not found`);
      return;
    }

    if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
      console.warn(`[ticketHub] Channel ${hubChannelId} is type ${channel.type}, expected GuildText or GuildAnnouncement`);
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("📩 Tickets — Los Esperados")
      .setDescription(
        "**Conditions d'admission :**\n" +
        "• 2500 minutes sur LYG\n" +
        "• 17 ans minimum\n" +
        "• 1 warn actif maximum\n\n" +
        "Des preuves peuvent être demandées.\n\n" +
        "Si vous souhaitez nous rejoindre, ouvrez un ticket ci-dessous.\n\n" +
        "**📌 Recrutement**\n" +
        "Pour rejoindre la famille Los Esperados.\n\n" +
        "**⚖️ Plainte**\n" +
        "Signaler un problème ou un abus."
      )
      .setColor(0x5865f2);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId("ticket:recruitment")
        .setLabel("Ouvrir un recrutement")
        .setStyle(ButtonStyle.Success)
        .setEmoji("📌"),
      new ButtonBuilder()
        .setCustomId("ticket:complaint")
        .setLabel("Ouvrir une plainte")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("⚖️")
    );

    const messages = await (channel as any).messages.fetch({ limit: 10 });
    let hubMessage = messages.find((msg: any) =>
      msg.author.id === client.user?.id &&
      msg.embeds.length > 0 &&
      (msg.embeds[0].title?.includes("Tickets") || msg.embeds[0].title?.includes("Système de tickets"))
    );

    if (hubMessage) {
      await hubMessage.edit({ embeds: [embed], components: [row] });
      console.log(`[ticketHub] HUB message updated in channel ${hubChannelId}`);
    } else {
      await (channel as any).send({ embeds: [embed], components: [row] });
      console.log(`[ticketHub] HUB message created in channel ${hubChannelId}`);
    }
  } catch (err) {
    console.error("[ticketHub] Error ensuring HUB:", err);
  }
}
