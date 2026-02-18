import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, EmbedBuilder, } from "discord.js";
import { CUSTOM_ID, IDS } from "./ids.js";
import { promises as fs } from "fs";
import path from "path";
const PANELS_FILE = path.join(process.cwd(), "data", "panels.json");
function log(event, data = {}) {
    console.log(JSON.stringify({
        event,
        ...data,
        timestamp: new Date().toISOString(),
    }));
}
async function readPanels() {
    try {
        const data = await fs.readFile(PANELS_FILE, "utf-8");
        return JSON.parse(data);
    }
    catch {
        return {};
    }
}
async function savePanels(panels) {
    try {
        await fs.mkdir(path.dirname(PANELS_FILE), { recursive: true });
        await fs.writeFile(PANELS_FILE, JSON.stringify(panels, null, 2));
    }
    catch (e) {
        log("panels_save_failed", { error: e instanceof Error ? e.message : String(e) });
    }
}
/**
 * TICKETS PANEL — IMMUTABLE
 * Message "Tickets — Los Esperados" avec Recrutement/Plainte
 * Créé UNE SEULE FOIS et JAMAIS modifié après, même si supprimé
 * ⚠️ Ne pas recréer si le message est supprimé — c'est intentionnel
 */
export async function ensureTicketsPanel(client) {
    const channel = await client.channels.fetch(IDS.CONTACT_CHANNEL_ID);
    if (!channel || channel.type !== ChannelType.GuildText) {
        throw new Error("CONTACT_CHANNEL_ID introuvable ou pas un salon texte");
    }
    const panels = await readPanels();
    const existingTicketsId = panels["tickets_panel_message_id"];
    // Si le message a déjà été créé (même s'il a été supprimé),
    // on ne crée rien. Le panel Tickets est figé et ne doit pas être modifié.
    if (existingTicketsId) {
        try {
            const msg = await channel.messages.fetch(existingTicketsId);
            log("tickets_panel_exists_frozen", { messageId: existingTicketsId, status: "active" });
            return;
        }
        catch (e) {
            // Message supprimé intentionnellement ou accidentellement
            // ON NE RECREE PAS — Le panel est figé
            log("tickets_panel_frozen", {
                messageId: existingTicketsId,
                status: "deleted_by_design",
                note: "Panel is frozen and will not be recreated"
            });
            return;
        }
    }
    // Créer le message Tickets UNE SEULE FOIS
    log("tickets_panel_creating_first_time");
    const embed = new EmbedBuilder()
        .setTitle("🎫 Tickets — Los Esperados")
        .setDescription("**Conditions d'admission :**\n" +
        "• Compter de 5 à 15 joueurs actifs\n" +
        "• Avoir une cohésion minimum\n" +
        "• Respecter le règlement\n\n" +
        "**Sélectionne une section ci-dessous :**")
        .addFields({
        name: "📋 Recrutement",
        value: "Candidature ou whitelist",
        inline: true,
    }, {
        name: "⚠️ Plainte",
        value: "Signalement ou litige",
        inline: true,
    })
        .setColor(0x5865f2)
        .setFooter({ text: "tickets-panel:immutable" });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setCustomId(CUSTOM_ID.PANEL_RECRUIT)
        .setLabel("Ouvrir un recrutement")
        .setStyle(ButtonStyle.Primary), new ButtonBuilder()
        .setCustomId(CUSTOM_ID.PANEL_COMPLAINT)
        .setLabel("Ouvrir une plainte")
        .setStyle(ButtonStyle.Danger));
    const newMsg = await channel.send({ embeds: [embed], components: [row] });
    panels["tickets_panel_message_id"] = newMsg.id;
    await savePanels(panels);
    log("tickets_panel_created_first_time", { messageId: newMsg.id, channel: IDS.CONTACT_CHANNEL_ID });
}
/**
 * LINK PANEL — POSTED ON DEMAND ONLY
 * Message "Panneau de liaison" dans BOTS_FAMILLE_CHANNEL_ID
 * Posté UNIQUEMENT quand un staff utilise la commande /linkpanel
 * PAS d'auto-création au boot
 */
export async function postLinkPanel(client) {
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
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder()
            .setCustomId(CUSTOM_ID.LINK_OPEN_PANEL)
            .setLabel("Demander une liaison")
            .setStyle(ButtonStyle.Success));
        // Poster le message (sans le sauvegarder comme "le" panneau fixe)
        const newMsg = await channel.send({ embeds: [embed], components: [row] });
        log("link_panel_posted_on_demand", { messageId: newMsg.id, channel: IDS.BOTS_FAMILLE_CHANNEL_ID });
        return { ok: true, messageId: newMsg.id };
    }
    catch (error) {
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
export async function ensureContactPanel(client) {
    await ensureTicketsPanel(client);
}
