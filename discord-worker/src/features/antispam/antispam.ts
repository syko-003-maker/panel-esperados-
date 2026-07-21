import { Message, EmbedBuilder, GuildMember, PermissionFlagsBits } from "discord.js";
import { sendLog } from "../logs/serverLogs.js";

// ─── Config ───────────────────────────────────────────────────────────────────

// Flood : X messages dans la fenêtre → timeout
// Réglages "laxistes" — on cible uniquement le flood agressif/raid, pas la
// conversation animée. Les anciens 6 msg / 4s déclenchaient régulièrement
// sur des échanges normaux à plusieurs.
const FLOOD_LIMIT  = 12;     // messages max dans la fenêtre
const FLOOD_WINDOW = 6000;   // fenêtre en ms (6s)
const FLOOD_MUTE   = 5;      // mute en minutes

// Mention spam — bumpé pour laisser passer les @ multi-roles légitimes
const MENTION_LIMIT = 10;    // nb de mentions max par message
const MENTION_MUTE  = 10;    // mute en minutes

// Liens — BLACKLIST mode (anti-phishing uniquement)
// Avant : whitelist stricte → tout site non listé = delete + warn → trop
// agressif sur les GIFs/médias partagés depuis sites tiers, tweets embed,
// etc. Désormais on autorise tout par défaut et on ne bloque que des
// domaines de scam/phishing connus.
const LINK_MUTE          = 5;
const LINK_STRIKE_WINDOW = 5 * 60_000;

// Patterns de domaines INTERDITS (typosquats Steam/Discord, phishing
// classique). Match partiel sur le hostname normalisé.
const LINK_BLACKLIST_PATTERNS: RegExp[] = [
  // Typosquats Discord / Steam (les vrais domaines sont whitelistés implicitement
  // en n'étant pas dans cette liste)
  /^stearncommunity\./i,
  /^steamcomrnunity\./i,
  /^steam-community\./i,
  /^steamcommunity\.[a-z]+\.[a-z]+/i,  // steamcommunity.foo.bar (subdomain abuse)
  /^discordnitro\./i,
  /^discord-nitro/i,
  /^discord-gift/i,
  /^discordapp\.[a-z]{3,}/i,  // discordapp.xyz, discordapp.club (vrai = .com)
  /-steam-/i,                  // free-steam-gift, steam-trade-bot…
  /-nitro-free/i,
  /free-nitro/i,
  // Raccourcisseurs souvent utilisés pour cacher des URLs malveillantes
  // (ces deux services SONT légitimes en eux-mêmes mais souvent abusés —
  // on bloque par précaution, libre à un staff de les whitelister)
  /^bit\.ly$/i,
  /^tinyurl\.com$/i,
];

const LINK_REGEX = /https?:\/\/[^\s<>\"]+/gi;

// Invitations Discord EXTERNES (pub pour d'autres serveurs) ─────────────────
const INVITE_MUTE = 30; // minutes (invite externe SANS signal adulte)
// Vrais codes d'invitation Discord (résolvables via l'API)
const DISCORD_INVITE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:discord(?:app)?\.com\/invite|discord\.gg)\/([\w-]+)/gi;
// Redirecteurs d'invitation tiers (quasi toujours de la pub) → traités comme externes
const INVITE_REDIRECTOR_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:discord\.me|dsc\.gg|invite\.gg|disboard\.org\/server\/join)\/[\w-]+/i;
// Signaux "adulte/spam" — combinés à une invite externe → BAN auto
const ADULT_PATTERNS: RegExp[] = [
  /18\s*\+/, /\bnsfw\b/i, /onlyfans/i, /\bporn/i, /\bxxx\b/i, /\bnudes?\b/i,
  /\bteens?\b/i, /sexcam/i, /camgirls?/i, /\bescort/i, /🔞/, /\bhorny\b/i, /\bmilf\b/i,
  /filles?\s+(?:chaudes?|nues?|coquines?|hot)/i, /nudes?\s+(?:gratuit|leak)/i,
  /\bleaks?\b/i, /rencontres?\s+coquines?/i, /sexe\s+gratuit/i, /\bsugar\s?daddy\b/i,
];

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

function isBlacklisted(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return LINK_BLACKLIST_PATTERNS.some((p) => p.test(hostname));
  } catch {
    // URL malformée → on laisse passer (la modération Discord native fera
    // son taf si besoin). Avant on retournait false → considéré comme non-
    // whitelisté → bloqué. Maintenant en mode blacklist on traite l'inverse.
    return false;
  }
}

function hasAdultSignals(content: string): boolean {
  return ADULT_PATTERNS.some((p) => p.test(content));
}

/**
 * Détecte une invitation vers un serveur Discord EXTERNE (≠ le nôtre).
 * Les redirecteurs tiers et les codes non résolvables sont considérés externes.
 */
async function hasForeignInvite(message: Message): Promise<boolean> {
  const content = message.content;
  if (INVITE_REDIRECTOR_REGEX.test(content)) return true;
  const codes = [...content.matchAll(DISCORD_INVITE_REGEX)].map((m) => m[1]);
  for (const code of codes) {
    try {
      const invite = await message.client.fetchInvite(code);
      if (!invite.guild || invite.guild.id !== message.guild!.id) return true;
    } catch {
      return true; // code mort / non résolvable → considéré externe
    }
  }
  return false;
}

/** Supprime le message, bannit le membre (+ purge des messages 24h) et loggue. */
async function banAndLog(member: GuildMember, reason: string, message: Message): Promise<void> {
  try {
    await message.delete().catch(() => {});
    await member.ban({ reason: `[Anti-spam] ${reason}`, deleteMessageSeconds: 24 * 3600 });

    const embed = new EmbedBuilder()
      .setTitle("🔨 Anti-spam — Ban automatique")
      .setColor(0xdc2626)
      .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL({ size: 64 }) })
      .addFields(
        { name: "👤 Membre",   value: `<@${member.id}> \`${member.id}\``,        inline: true },
        { name: "📌 Salon",    value: `<#${message.channelId}>`,                 inline: true },
        { name: "📋 Raison",   value: reason,                                    inline: false },
        { name: "🧹 Nettoyage", value: "Messages des dernières 24h supprimés",    inline: false },
      )
      .setTimestamp();

    sendLog(message.guild!, embed);
  } catch { /* rôle trop haut / permissions insuffisantes */ }
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

  // 3. Invitation vers un Discord EXTERNE (pub) ────────────────────────────────
  // Choix staff : ban auto si signaux adulte/spam, sinon suppression + mute +
  // alerte (le log embed prévient le staff). Staff exempté plus haut.
  if (await hasForeignInvite(message)) {
    if (hasAdultSignals(message.content)) {
      await banAndLog(member, "Publicité pour un Discord externe à caractère adulte/spam", message);
    } else {
      await muteAndLog(
        member,
        "Invitation vers un Discord externe (publicité non autorisée)",
        INVITE_MUTE,
        message
      );
    }
    return;
  }

  // 4. Lien blacklisté (phishing/scam connu) — système progressif ─────────────
  // Mode blacklist : tout est autorisé SAUF les domaines de phishing connus.
  // GIFs, embeds, partages média → tout passe désormais.
  const links = message.content.match(LINK_REGEX) ?? [];
  const forbidden = links.filter((l) => isBlacklisted(l));

  if (forbidden.length > 0) {
    const lastStrike = linkStrikeMap.get(member.id);
    const isRecidive = lastStrike !== undefined && now - lastStrike < LINK_STRIKE_WINDOW;

    if (isRecidive) {
      linkStrikeMap.delete(member.id);
      await muteAndLog(
        member,
        `Lien suspect (phishing/scam, récidive)`,
        LINK_MUTE,
        message
      );
    } else {
      linkStrikeMap.set(member.id, now);
      await warnAndDelete(
        member,
        `Lien suspect détecté (potentiel phishing/scam).`,
        message
      );
    }
  }
}
