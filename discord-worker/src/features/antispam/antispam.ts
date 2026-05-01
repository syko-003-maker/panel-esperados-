import { Message, EmbedBuilder, GuildMember, PermissionFlagsBits } from "discord.js";
import { sendLog } from "../logs/serverLogs.js";

// ─── Config ───────────────────────────────────────────────────────────────────

// Flood : X messages dans la fenêtre → timeout
const FLOOD_LIMIT  = 6;      // messages max dans la fenêtre
const FLOOD_WINDOW = 4000;   // fenêtre en ms (4s)
const FLOOD_MUTE   = 5;      // mute en minutes

// Mention spam
const MENTION_LIMIT = 5;     // nb de mentions max par message (était 3 → trop strict)
const MENTION_MUTE  = 10;    // mute en minutes

// Liens — système progressif
// Offense 1 : suppression + avertissement en salon, pas de mute
// Offense 2+ (dans LINK_STRIKE_WINDOW ms) : mute
const LINK_MUTE          = 5;           // mute en minutes si récidive
const LINK_STRIKE_WINDOW = 5 * 60_000; // fenêtre de récidive (5 min)

// Domaines autorisés — étendus avec tous les sites courants
const LINK_WHITELIST = [
  // Discord natif
  "discord.gg", "discord.com", "discordapp.com",
  "cdn.discordapp.com", "media.discordapp.net",
  // GIFs
  "tenor.com", "giphy.com", "gfycat.com",
  // Hébergement d'images
  "imgur.com", "i.imgur.com",
  "prnt.sc", "prntscr.com", "gyazo.com",
  "postimg.cc", "ibb.co",
  // Vidéo
  "youtube.com", "youtu.be",
  "twitch.tv", "clips.twitch.tv",
  "streamable.com", "medal.tv",
  // Réseaux sociaux courants
  "twitter.com", "x.com", "t.co",
  "instagram.com",
  "tiktok.com", "vm.tiktok.com",
  "reddit.com", "redd.it",
  "facebook.com", "fb.com",
  // Info / médias
  "google.com", "google.fr",
  "wikipedia.org",
  "github.com", "gist.github.com",
  // Stockage / partage
  "pastebin.com",
  "docs.google.com", "drive.google.com",
  // GTA RP / communauté
  "fivem.net", "cfx.re",
  "gta.world",
];

const LINK_REGEX = /https?:\/\/[^\s<>\"]+/gi;

// ─── State (en mémoire) ───────────────────────────────────────────────────────

/** Flood : timestamps des messages récents par userId */
const floodMap = new Map<string, number[]>();

/** Liens : horodatage de la dernière infraction de lien par userId */
const linkStrikeMap = new Map<string, number>();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function muteAndLog(
  member: GuildMember,
  reason: string,
  minutes: number,
  message: Message
): Promise<void> {
  try {
    await message.delete().catch(() => {});
    await member.timeout(minutes * 60 * 1000, `[Anti-spam] ${reason}`);

    const until = new Date(Date.now() + minutes * 60 * 1000);
    const embed = new EmbedBuilder()
      .setTitle("🤖 Anti-spam — Mute automatique")
      .setColor(0xef4444)
      .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL({ size: 64 }) })
      .addFields(
        { name: "👤 Membre", value: `<@${member.id}>`,                             inline: true },
        { name: "📌 Salon",  value: `<#${message.channelId}>`,                     inline: true },
        { name: "⏱️ Durée",  value: `${minutes} minute(s)`,                        inline: true },
        { name: "📋 Raison", value: reason,                                         inline: false },
        { name: "⏰ Expire", value: `<t:${Math.floor(until.getTime() / 1000)}:R>`, inline: true },
      )
      .setTimestamp();

    sendLog(message.guild!, embed);
  } catch { /* membre non trouvable ou permissions insuffisantes */ }
}

/** Supprime le message et envoie un avertissement visible dans le salon */
async function warnAndDelete(
  member: GuildMember,
  reason: string,
  message: Message
): Promise<void> {
  try {
    await message.delete().catch(() => {});

    const chan = message.channel;
    const warn = "send" in chan
      ? await (chan as { send: (s: string) => Promise<Message> })
          .send(`⚠️ <@${member.id}> — ${reason} Si tu récidives dans les 5 prochaines minutes, tu seras muté automatiquement.`)
          .catch(() => null)
      : null;

    // Auto-suppression de l'avertissement après 8s
    if (warn) setTimeout(() => warn.delete().catch(() => {}), 8000);

    const embed = new EmbedBuilder()
      .setTitle("⚠️ Anti-spam — Avertissement")
      .setColor(0xf59e0b)
      .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL({ size: 64 }) })
      .addFields(
        { name: "👤 Membre", value: `<@${member.id}>`, inline: true },
        { name: "📌 Salon",  value: `<#${message.channelId}>`, inline: true },
        { name: "📋 Raison", value: reason, inline: false },
      )
      .setTimestamp();

    sendLog(message.guild!, embed);
  } catch { /* non bloquant */ }
}

function isWhitelisted(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return LINK_WHITELIST.some((w) => hostname === w || hostname.endsWith("." + w));
  } catch {
    return false;
  }
}

// ─── Export principal ─────────────────────────────────────────────────────────

export async function handleAntispam(message: Message): Promise<void> {
  if (!message.guild || message.author.bot) return;

  const member =
    message.guild.members.cache.get(message.author.id) ??
    (await message.guild.members.fetch(message.author.id).catch(() => null));

  if (!member) return;

  // Immunité pour les modérateurs et admins
  if (member.permissions.has(PermissionFlagsBits.ManageMessages)) return;

  const now = Date.now();

  // 1. Flood ──────────────────────────────────────────────────────────────────
  const timestamps = (floodMap.get(member.id) ?? []).filter((t) => now - t < FLOOD_WINDOW);
  timestamps.push(now);
  floodMap.set(member.id, timestamps);

  if (timestamps.length >= FLOOD_LIMIT) {
    floodMap.delete(member.id);
    await muteAndLog(
      member,
      `Flood (${timestamps.length} messages en ${FLOOD_WINDOW / 1000}s)`,
      FLOOD_MUTE,
      message
    );
    return;
  }

  // 2. Mention spam ──────────────────────────────────────────────────────────
  const mentionCount = message.mentions.users.size + message.mentions.roles.size;
  if (mentionCount >= MENTION_LIMIT) {
    await muteAndLog(
      member,
      `Spam de mentions (${mentionCount} mentions en un seul message)`,
      MENTION_MUTE,
      message
    );
    return;
  }

  // 3. Lien non autorisé — système progressif ─────────────────────────────────
  const links = message.content.match(LINK_REGEX) ?? [];
  const forbidden = links.filter((l) => !isWhitelisted(l));

  if (forbidden.length > 0) {
    const lastStrike = linkStrikeMap.get(member.id);
    const isRecidive = lastStrike !== undefined && now - lastStrike < LINK_STRIKE_WINDOW;

    if (isRecidive) {
      // 2e infraction dans la fenêtre → mute
      linkStrikeMap.delete(member.id);
      await muteAndLog(
        member,
        `Envoi de lien non autorisé (récidive)`,
        LINK_MUTE,
        message
      );
    } else {
      // 1ère infraction → avertissement uniquement
      linkStrikeMap.set(member.id, now);
      await warnAndDelete(
        member,
        `Les liens vers des sites non autorisés sont interdits ici.`,
        message
      );
    }
  }
}
