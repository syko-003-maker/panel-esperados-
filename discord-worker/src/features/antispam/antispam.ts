import { Message, EmbedBuilder, GuildMember, PermissionFlagsBits } from "discord.js";
import { sendLog } from "../logs/serverLogs";

// ─── Config ───────────────────────────────────────────────────────────────────
const FLOOD_LIMIT    = 5;     // messages max dans la fenêtre
const FLOOD_WINDOW   = 3000;  // fenêtre en ms
const FLOOD_MUTE     = 5;     // mute en minutes

const MENTION_LIMIT  = 3;     // nb de mentions max par message
const MENTION_MUTE   = 10;

const LINK_MUTE      = 5;
const LINK_WHITELIST = [
  "discord.gg", "discord.com",
  "tenor.com", "giphy.com",
  "youtube.com", "youtu.be",
  "twitch.tv",
];

const LINK_REGEX = /https?:\/\/[^\s]+/gi;

// ─── State flood (en mémoire) ─────────────────────────────────────────────────
const floodMap = new Map<string, number[]>();

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
        { name: "👤 Membre",  value: `<@${member.id}>`,                                    inline: true },
        { name: "📌 Salon",   value: `<#${message.channelId}>`,                            inline: true },
        { name: "⏱️ Durée",   value: `${minutes} minute(s)`,                               inline: true },
        { name: "📋 Raison",  value: reason,                                                inline: false },
        { name: "⏰ Expire",  value: `<t:${Math.floor(until.getTime() / 1000)}:R>`,        inline: true },
      )
      .setTimestamp();

    sendLog(message.guild!, embed);
  } catch { /* membre non trouvable ou permissions insuffisantes */ }
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

  // 1. Flood ──────────────────────────────────────────────────────────────────
  const now = Date.now();
  const timestamps = (floodMap.get(member.id) ?? []).filter((t) => now - t < FLOOD_WINDOW);
  timestamps.push(now);
  floodMap.set(member.id, timestamps);

  if (timestamps.length >= FLOOD_LIMIT) {
    floodMap.delete(member.id);
    await muteAndLog(member, `Flood (${FLOOD_LIMIT} messages en ${FLOOD_WINDOW / 1000}s)`, FLOOD_MUTE, message);
    return;
  }

  // 2. Mention spam ──────────────────────────────────────────────────────────
  const mentionCount = message.mentions.users.size + message.mentions.roles.size;
  if (mentionCount >= MENTION_LIMIT) {
    await muteAndLog(member, `Spam de mentions (${mentionCount} mentions)`, MENTION_MUTE, message);
    return;
  }

  // 3. Lien non autorisé ─────────────────────────────────────────────────────
  const links = message.content.match(LINK_REGEX) ?? [];
  const forbidden = links.filter((l) => !isWhitelisted(l));
  if (forbidden.length > 0) {
    await muteAndLog(member, `Envoi de lien non autorisé`, LINK_MUTE, message);
    return;
  }
}
