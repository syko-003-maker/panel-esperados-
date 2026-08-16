import {
  Client,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  TextChannel,
  ChannelType,
} from "discord.js";
import { getInternalPanelUrl } from "../../lib/urls.js";

/**
 * Suggestions côté Discord — commande /suggestion (modal) + embed avec bouton
 * de vote + reconciler qui poste les suggestions créées sur le site et
 * synchronise les compteurs/statuts. Tout passe par les endpoints panel
 * /api/discord/suggestions/* (auth x-ingest-secret) → même DB que le site
 * (1 vote/membre, site OU Discord).
 */

const PANEL_BASE_URL = getInternalPanelUrl();
const WORKER_SECRET = process.env.DISCORD_WORKER_SECRET ?? process.env.INGEST_SECRET ?? "";
const SUGGESTIONS_CHANNEL_ID = process.env.SUGGESTIONS_CHANNEL_ID ?? "";
const RECONCILE_INTERVAL_MS = 60_000;

async function panelFetch(path: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${PANEL_BASE_URL}${path}`, {
    ...options,
    headers: { ...(options.headers || {}), "x-ingest-secret": WORKER_SECRET, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(10_000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`panel ${res.status}: ${json?.error || json?.message || ""}`);
  return json;
}

type Sug = {
  id: string;
  title: string;
  description: string;
  status: string;
  votes: number;
  authorName: string;
  staffNote?: string | null;
  comments?: { authorName: string; message: string }[];
  commentCount?: number;
  discordMessageId: string | null;
  discordChannelId: string | null;
};

const STATUS_META: Record<string, { label: string; color: number }> = {
  OPEN: { label: "🔎 À l'étude", color: 0x38bdf8 },
  PLANNED: { label: "📌 Prévu", color: 0xf59e0b },
  DONE: { label: "✅ Fait", color: 0x34d399 },
  REJECTED: { label: "❌ Refusé", color: 0xf43f5e },
};

function buildEmbed(s: Sug): EmbedBuilder {
  const meta = STATUS_META[s.status] ?? STATUS_META.OPEN;
  const embed = new EmbedBuilder()
    .setTitle(`💡 ${s.title}`.slice(0, 256))
    .setDescription(s.description.slice(0, 4000))
    .addFields(
      { name: "Statut", value: meta.label, inline: true },
      { name: "Auteur", value: s.authorName || "?", inline: true }
    )
    .setColor(meta.color)
    .setFooter({ text: "Vote avec le bouton — 1 vote par membre (site ou Discord)" });
  const comments = Array.isArray(s.comments) ? s.comments : [];
  if (comments.length) {
    const shown = comments.slice(-4); // les 4 derniers commentaires
    const text = shown.map((c) => `**${c.authorName}** : ${c.message}`).join("\n\n").slice(0, 1024);
    embed.addFields({ name: `💬 Réponses du staff (${comments.length})`, value: text || "—" });
  } else if (s.staffNote && s.staffNote.trim()) {
    embed.addFields({ name: "💬 Réponse du staff", value: s.staffNote.slice(0, 1024) });
  }
  return embed;
}

// Nom du post forum PRÉFIXÉ par le statut → reconnaissable dans la liste du
// salon sans ouvrir le post (🔎 À l'étude / 📌 Prévu / ✅ Fait / ❌ Refusé).
function threadName(s: Sug): string {
  const meta = STATUS_META[s.status] ?? STATUS_META.OPEN;
  return `${meta.label} · ${s.title || `Suggestion ${s.id}`}`.slice(0, 100);
}

function buildRow(id: string, votes: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`sug:vote:${id}`).setLabel(`👍 ${votes}`).setStyle(ButtonStyle.Primary)
  );
}

// État rendu en mémoire (partagé reconciler + bouton) → évite les éditions inutiles.
const rendered = new Map<string, { votes: number; status: string; commentCount: number; messageId: string }>();

/**
 * Poste une suggestion dans le salon — gère les salons TEXTE (send) ET FORUM
 * (création d'un post/thread). Sur un forum, l'ID du thread == l'ID du message
 * de départ, donc messageId === channelId (le thread).
 */
async function postSuggestion(
  channel: unknown,
  sug: Sug
): Promise<{ messageId: string; channelId: string } | null> {
  const ch = channel as any;
  if (ch?.type === ChannelType.GuildForum) {
    const thread = await ch.threads.create({
      name: threadName(sug),
      message: { embeds: [buildEmbed(sug)], components: [buildRow(sug.id, sug.votes)] },
    });
    return { messageId: thread.id, channelId: thread.id };
  }
  if (typeof ch?.isTextBased === "function" && ch.isTextBased()) {
    const msg = await ch.send({ embeds: [buildEmbed(sug)], components: [buildRow(sug.id, sug.votes)] });
    return { messageId: msg.id, channelId: ch.id };
  }
  return null;
}

/** /suggestion → ouvre le modal (titre + description). */
export async function handleSuggestionCommand(interaction: ChatInputCommandInteraction) {
  const modal = new ModalBuilder().setCustomId("sug:create").setTitle("Proposer une suggestion");
  const title = new TextInputBuilder()
    .setCustomId("title")
    .setLabel("Titre")
    .setStyle(TextInputStyle.Short)
    .setMinLength(4)
    .setMaxLength(120)
    .setRequired(true);
  const description = new TextInputBuilder()
    .setCustomId("description")
    .setLabel("Décris ton idée")
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(10)
    .setMaxLength(2000)
    .setRequired(true);
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(title),
    new ActionRowBuilder<TextInputBuilder>().addComponents(description)
  );
  await interaction.showModal(modal);
}

/** Soumission du modal → crée la suggestion + poste l'embed. */
export async function handleSuggestionModalSubmit(interaction: ModalSubmitInteraction, client: Client) {
  const title = interaction.fields.getTextInputValue("title").trim();
  const description = interaction.fields.getTextInputValue("description").trim();
  await interaction.deferReply({ ephemeral: true });
  try {
    const res = await panelFetch("/api/discord/suggestions", {
      method: "POST",
      body: JSON.stringify({ authorDiscordId: interaction.user.id, title, description }),
    }).catch((e) => ({ ok: false, message: String(e.message || e) }));

    if (!res?.ok) {
      await interaction.editReply(res?.message?.includes("403") ? "Tu dois être membre de la famille." : res?.message || "Erreur.");
      return;
    }

    if (!SUGGESTIONS_CHANNEL_ID) {
      await interaction.editReply("✅ Suggestion enregistrée (le salon Discord n'est pas configuré côté worker).");
      return;
    }
    const channel = await client.channels.fetch(SUGGESTIONS_CHANNEL_ID).catch(() => null);
    const sug: Sug = {
      id: res.id,
      title,
      description,
      status: "OPEN",
      votes: res.votes ?? 1,
      authorName: res.authorName ?? interaction.user.username,
      staffNote: null,
      discordMessageId: null,
      discordChannelId: null,
    };
    const posted = channel ? await postSuggestion(channel, sug).catch(() => null) : null;
    if (posted) {
      await panelFetch(`/api/discord/suggestions/${res.id}`, {
        method: "PATCH",
        body: JSON.stringify({ discordMessageId: posted.messageId, discordChannelId: posted.channelId }),
      }).catch(() => {});
      rendered.set(res.id, { votes: sug.votes, status: "OPEN", commentCount: 0, messageId: posted.messageId });
    }
    await interaction.editReply("✅ Ta suggestion est postée ! Les membres peuvent voter.");
  } catch (e) {
    console.error("[suggestions modal]", e instanceof Error ? e.message : e);
    await interaction.editReply("Erreur lors de la création de la suggestion.").catch(() => {});
  }
}

/** Clic bouton vote → toggle + met à jour le compteur de l'embed. */
export async function handleSuggestionVoteButton(interaction: ButtonInteraction) {
  const id = interaction.customId.split(":")[2];
  if (!id) return;
  try {
    const res = await panelFetch(`/api/discord/suggestions/${id}/vote`, {
      method: "POST",
      body: JSON.stringify({ voterDiscordId: interaction.user.id }),
    }).catch((e) => ({ ok: false, message: String(e.message || e) }));

    if (!res?.ok) {
      await interaction.reply({
        content: res?.message?.includes("403") ? "Tu dois être membre de la famille pour voter." : "Impossible de voter.",
        ephemeral: true,
      });
      return;
    }
    await interaction.update({ components: [buildRow(id, res.votes)] });
    const prev = rendered.get(id);
    if (prev) rendered.set(id, { ...prev, votes: res.votes });
  } catch (e) {
    console.error("[suggestions vote]", e instanceof Error ? e.message : e);
    await interaction.reply({ content: "Erreur.", ephemeral: true }).catch(() => {});
  }
}

/** Reconciler : poste les suggestions créées sur le site + resynchronise. */
export function startSuggestionsReconciler(client: Client) {
  if (!SUGGESTIONS_CHANNEL_ID) {
    console.warn("[suggestions] SUGGESTIONS_CHANNEL_ID non défini → reconciler désactivé (les suggestions site n'iront pas sur Discord)");
    return;
  }
  const tick = async () => {
    try {
      const res = await panelFetch("/api/discord/suggestions", { method: "GET" });
      if (!res?.ok || !Array.isArray(res.data)) return;
      for (const s of res.data as Sug[]) {
        const commentCount = s.commentCount ?? (Array.isArray(s.comments) ? s.comments.length : 0);
        if (!s.discordMessageId) {
          const channel = await client.channels.fetch(SUGGESTIONS_CHANNEL_ID).catch(() => null);
          if (!channel) continue;
          const posted = await postSuggestion(channel, s).catch(() => null);
          if (!posted) continue;
          await panelFetch(`/api/discord/suggestions/${s.id}`, {
            method: "PATCH",
            body: JSON.stringify({ discordMessageId: posted.messageId, discordChannelId: posted.channelId }),
          }).catch(() => {});
          rendered.set(s.id, { votes: s.votes, status: s.status, commentCount, messageId: posted.messageId });
        } else {
          const prev = rendered.get(s.id);
          if (prev && prev.votes === s.votes && prev.status === s.status && prev.commentCount === commentCount) continue;
          const statusChanged = !prev || prev.status !== s.status;
          const channel = await client.channels.fetch(s.discordChannelId || SUGGESTIONS_CHANNEL_ID).catch(() => null);
          if (!channel?.isTextBased()) continue;
          const msg = await (channel as any).messages.fetch(s.discordMessageId).catch(() => null);
          if (!msg) {
            rendered.delete(s.id);
            continue;
          }
          await msg.edit({ embeds: [buildEmbed(s)], components: [buildRow(s.id, s.votes)] }).catch(() => {});
          // Statut changé → renomme le post forum pour que ce soit reconnaissable
          // dans la liste du salon (🔎 À l'étude / 📌 Prévu / ✅ Fait / ❌ Refusé).
          if (statusChanged && (channel as any).isThread?.() && typeof (channel as any).setName === "function") {
            await (channel as any).setName(threadName(s)).catch(() => {});
          }
          rendered.set(s.id, { votes: s.votes, status: s.status, commentCount, messageId: s.discordMessageId });
        }
      }
    } catch (e) {
      console.error("[suggestions reconciler]", e instanceof Error ? e.message : e);
    }
  };
  setInterval(tick, RECONCILE_INTERVAL_MS);
  setTimeout(tick, 8_000);
  console.log("[suggestions] reconciler démarré (60s)");
}
