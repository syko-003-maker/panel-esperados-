/**
 * Système règlement — donne automatiquement le rôle Citoyen(e) LYG
 * quand un membre clique sur le bouton "J'accepte le règlement".
 *
 * Usage : appeler setupReglementButton(client) dans index.ts après ready.
 * Pour poster le message règlement : commande slash /reglement-post dans un salon admin.
 */

import {
  Client,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
} from "discord.js";

// ID du rôle Citoyen(e) LYG à attribuer
const CITOYEN_ROLE_ID = "1337795596739940372";

// custom_id du bouton (doit être unique dans tout le bot)
export const REGLEMENT_ACCEPT_BUTTON = "reglement:accept";

/**
 * Construit le message embed + bouton d'acceptation du règlement.
 * À utiliser pour poster OU re-poster le message dans le salon règlement.
 */
export function buildReglementMessage() {
  const embed = new EmbedBuilder()
    .setTitle("📜 Règlement de la communauté")
    .setDescription(
      "En cliquant sur le bouton ci-dessous, vous confirmez avoir **lu et accepté** le règlement de la communauté **Los Esperados**.\n\n" +
      "Le rôle **Citoyen(e) LYG** vous sera attribué automatiquement."
    )
    .setColor(0x3b82f6)
    .setFooter({ text: "Los Esperados — Panel Bot" })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(REGLEMENT_ACCEPT_BUTTON)
      .setLabel("✅ J'ai lu et j'accepte le règlement")
      .setStyle(ButtonStyle.Success)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Gère le clic sur le bouton d'acceptation.
 * Appelé depuis le handler interactionCreate de index.ts.
 */
export async function handleReglementAccept(interaction: ButtonInteraction): Promise<void> {
  const member = interaction.member;
  if (!member || !("roles" in member)) {
    await interaction.reply({ content: "❌ Impossible de récupérer vos informations.", flags: 64 });
    return;
  }

  // Vérifier si le membre a déjà le rôle
  const hasRole = member.roles instanceof Array
    ? member.roles.includes(CITOYEN_ROLE_ID)
    : member.roles.cache.has(CITOYEN_ROLE_ID);

  if (hasRole) {
    await interaction.reply({
      content: "✅ Vous avez déjà le rôle **Citoyen(e) LYG** !",
      flags: 64,
    });
    return;
  }

  try {
    await (member.roles as any).add(CITOYEN_ROLE_ID);
    await interaction.reply({
      content: "✅ Bienvenue ! Le rôle **Citoyen(e) LYG** vous a été attribué.",
      flags: 64,
    });
  } catch (err) {
    console.error("[Reglement] Erreur attribution rôle :", err);
    await interaction.reply({
      content: "❌ Une erreur est survenue lors de l'attribution du rôle. Contactez un administrateur.",
      flags: 64,
    });
  }
}

/**
 * Gère la commande slash /reglement-post pour (re)poster le message règlement.
 * Seul le staff peut utiliser cette commande.
 */
export async function handleReglementPost(
  interaction: ChatInputCommandInteraction
): Promise<void> {
  await interaction.deferReply({ flags: 64 });

  const targetChannel = interaction.options.getChannel("salon") ?? interaction.channel;
  if (!targetChannel || !("send" in targetChannel)) {
    await interaction.editReply("❌ Salon introuvable.");
    return;
  }

  try {
    await (targetChannel as any).send(buildReglementMessage());
    await interaction.editReply(`✅ Message règlement posté dans <#${targetChannel.id}>.`);
  } catch (err) {
    console.error("[Reglement] Erreur envoi message :", err);
    await interaction.editReply("❌ Impossible de poster le message dans ce salon.");
  }
}
