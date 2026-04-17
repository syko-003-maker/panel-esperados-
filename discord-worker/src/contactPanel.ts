import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  type Client,
  type Message,
} from "discord.js";
import { CUSTOM_ID, IDS, PANEL_MARKER_FOOTER } from "./ids.js";
import { promises as fs } from "fs";
import path from "path";

const PANELS_FILE = path.join(process.cwd(), "data", "panels.json");

function log(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({
    event,
    ...data,
    timestamp: new Date().toISOString(),
  }));
}

async function readPanels(): Promise<Record<string, string>> {
  try {
    const data = await fs.readFile(PANELS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function savePanels(panels: Record<string, string>) {
  try {
    await fs.mkdir(path.dirname(PANELS_FILE), { recursive: true });
    await fs.writeFile(PANELS_FILE, JSON.stringify(panels, null, 2));
  } catch (e) {
    log("panels_save_failed", { error: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * TICKETS PANEL — IMMUTABLE
 * Message "Tickets — Los Esperados" avec Recrutement/Plainte
 * Créé UNE SEULE FOIS et JAMAIS modifié après, même si supprimé
 * ⚠️ Ne pas recréer si le message est supprimé — c'est intentionnel
 */
export async function ensureTicketsPanel(client: Client) {
  const channel = await client.channels.fetch(IDS.CONTACT_CHANNEL_ID);
  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new Error("CONTACT_CHANNEL_ID introuvable ou pas un salon texte");
  }

  const embed = new EmbedBuilder()
    .setTitle("📩 Tickets — Los Esperados")
    .setDescription(
      "**Conditions d'admission :**\n" +
        "• 2500 minutes minimum sur LYG\n" +
        "• 17 ans minimum\n" +
        "• 1 warn actif maximum\n\n" +
        "➡️ Exception possible avec l'accord du Chef Recruteur ou Chef de famille\n\n" +
        "Des preuves peuvent être demandées.\n\n" +
        "Si vous souhaitez nous rejoindre, ouvrez un ticket ci-dessous."
    )
    .addFields(
      {
        name: "📌 Recrutement",
        value: "Pour rejoindre la famille Los Esperados.",
        inline: true,
      },
      {
        name: "⚖️ Plainte",
        value: "Signaler un problème ou un abus.",
        inline: true,
      }
    )
    .setColor(0x5865f2)
    ;

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(CUSTOM_ID.PANEL_RECRUIT)
      .setLabel("Ouvrir un recrutement")
      .setEmoji("📌")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(CUSTOM_ID.PANEL_COMPLAINT)
      .setLabel("Ouvrir une plainte")
      .setEmoji("⚖️")
      .setStyle(ButtonStyle.Danger)
  );

  const panels = await readPanels();
  const existingTicketsId = panels["tickets_panel_message_id"];

  // Si le message existe encore, on le met à jour pour refléter le texte courant.
  if (existingTicketsId) {
    try {
      const msg = await channel.messages.fetch(existingTicketsId);
      await msg.edit({ embeds: [embed], components: [row] });
      log("tickets_panel_updated", { messageId: existingTicketsId, status: "active" });
      return;
    } catch (e) {
      // Message introuvable ou obsolète: on reposte et on remplace l'id stocké.
      log("tickets_panel_missing_recreate", {
        messageId: existingTicketsId, 
        status: "stale_or_deleted",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  log(existingTicketsId ? "tickets_panel_recreated" : "tickets_panel_creating_first_time");
  const newMsg = await channel.send({ embeds: [embed], components: [row] });
  panels["tickets_panel_message_id"] = newMsg.id;
  panels["last_updated"] = new Date().toISOString();
  await savePanels(panels);
  log(existingTicketsId ? "tickets_panel_recreated_success" : "tickets_panel_created_first_time", {
    messageId: newMsg.id,
    previousMessageId: existingTicketsId ?? null,
    channel: IDS.CONTACT_CHANNEL_ID,
  });
}

/**
 * LINK PANEL — POSTED ON DEMAND ONLY
 * Message "Panneau de liaison" dans BOTS_FAMILLE_CHANNEL_ID
 * Posté UNIQUEMENT quand un staff utilise la commande /linkpanel
 * PAS d'auto-création au boot
 */
export async function postLinkPanel(client: Client): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  try {
    const channel = await client.channels.fetch(IDS.BOTS_FAMILLE_CHANNEL_ID);
    if (!channel || channel.type !== ChannelType.GuildText) {
      return { ok: false, error: "BOTS_FAMILLE_CHANNEL_ID introuvable ou pas un salon texte" };
    }

    const embed = new EmbedBuilder()
      .setTitle("🔗 Panneau de liaison")
      .setDescription("Utilisez le bouton ci-dessous pour demander une liaison.")
      .setColor(0x5865f2)
      .setFooter({ text: "link-panel:v1" });

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(CUSTOM_ID.LINK_OPEN_PANEL)
        .setLabel("Demander une liaison")
        .setStyle(ButtonStyle.Success)
    );

    // Poster le message (sans le sauvegarder comme "le" panneau fixe)
    const newMsg = await channel.send({ embeds: [embed], components: [row] });
    log("link_panel_posted_on_demand", { messageId: newMsg.id, channel: IDS.BOTS_FAMILLE_CHANNEL_ID });
    
    return { ok: true, messageId: newMsg.id };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    log("link_panel_post_failed", { error: message });
    return { ok: false, error: message };
  }
}

/**
 * LEGACY — Deprecated
 * Garder pour compatibilité, utilise UNIQUEMENT ensureTicketsPanel
 * Link panel uniquement via /linkpanel (pas d'auto-post au boot)
 */
export async function ensureContactPanel(client: Client) {
  await ensureTicketsPanel(client);
}

