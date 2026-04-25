/**
 * Système de logs serveur + auto-rôle après validation Discord Community screening.
 */

import {
  Client,
  EmbedBuilder,
  type GuildMember,
  type PartialGuildMember,
  type Message,
  type PartialMessage,
  type TextChannel,
  type Guild,
  type User,
} from "discord.js";

const LOGS_CHANNEL_ID  = "1312846003627622522";
const CITOYEN_ROLE_ID  = "1337795596739940372";

// ─── Mini-cache messages ──────────────────────────────────────────────────────

interface CachedMsg {
  authorId: string;
  authorTag: string;
  authorAvatar: string | null;
  content: string;
  channelId: string;
  isBot: boolean;
}

const msgCache = new Map<string, CachedMsg>();
const MSG_CACHE_MAX = 2000;

export function cacheMessage(message: Message): void {
  if (!message.guildId) return;
  if (msgCache.size >= MSG_CACHE_MAX) {
    const firstKey = msgCache.keys().next().value;
    if (firstKey) msgCache.delete(firstKey);
  }
  msgCache.set(message.id, {
    authorId:    message.author.id,
    authorTag:   message.author.tag,
    authorAvatar: message.author.displayAvatarURL({ size: 64 }),
    content:     message.content ?? "",
    channelId:   message.channelId,
    isBot:       message.author.bot,
  });
}

// ─── Salon logs ───────────────────────────────────────────────────────────────

let logsChannelCache: TextChannel | null = null;

async function sendLog(guild: Guild, embed: EmbedBuilder): Promise<void> {
  try {
    if (!logsChannelCache) {
      const fetched = await guild.channels.fetch(LOGS_CHANNEL_ID);
      if (!fetched || !fetched.isTextBased()) {
        console.error("[Logs] Salon logs introuvable :", LOGS_CHANNEL_ID);
        return;
      }
      logsChannelCache = fetched as TextChannel;
    }
    await logsChannelCache.send({ embeds: [embed] });
  } catch (err) {
    logsChannelCache = null;
    console.error("[Logs] Erreur envoi :", err);
  }
}

// ─── Auto-rôle : Discord Community screening ─────────────────────────────────
// Quand un membre passe de pending=true à pending=false (valide le règlement Discord),
// on lui donne automatiquement le rôle Citoyen(e) LYG.

export async function onScreeningComplete(
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember
): Promise<void> {
  // pending: true = n'a pas encore accepté les règles Discord Community
  const wasPending = "pending" in oldMember ? oldMember.pending : true;
  const isNowVerified = !newMember.pending;

  if (!wasPending || !isNowVerified) return; // Pas un passage de screening

  try {
    if (!newMember.roles.cache.has(CITOYEN_ROLE_ID)) {
      await newMember.roles.add(CITOYEN_ROLE_ID);
      console.log(`[AutoRole] Rôle Citoyen(e) LYG attribué à ${newMember.user.tag}`);
    }
  } catch (err) {
    console.error("[AutoRole] Erreur attribution rôle :", err);
  }
}

// ─── Membre rejoint ───────────────────────────────────────────────────────────

export function onMemberJoin(member: GuildMember): void {
  const createdTs  = Math.floor(member.user.createdTimestamp / 1000);
  const accountAge = Math.floor((Date.now() - member.user.createdTimestamp) / 86_400_000);

  const embed = new EmbedBuilder()
    .setAuthor({
      name:    `${member.user.tag} a rejoint le serveur`,
      iconURL: member.user.displayAvatarURL({ size: 64 }),
    })
    .setColor(0x22c55e)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setDescription(`<@${member.id}>`)
    .addFields(
      { name: "🆔 Discord ID",   value: `\`${member.id}\``,                                                                              inline: true },
      { name: "📅 Compte créé",  value: `<t:${createdTs}:D>\n<t:${createdTs}:R>`,                                                        inline: true },
      { name: "⚠️ Âge du compte", value: accountAge < 7 ? `⚠️ **${accountAge} jour(s)** — Compte récent !` : `${accountAge} jour(s)`, inline: true },
    )
    .setFooter({ text: `👥 ${member.guild.memberCount} membres` })
    .setTimestamp();

  sendLog(member.guild, embed);
}

// ─── Membre parti / kick ─────────────────────────────────────────────────────

export async function onMemberLeave(member: GuildMember | PartialGuildMember): Promise<void> {
  const roles = !( member.roles instanceof Array)
    ? member.roles.cache.filter((r) => r.name !== "@everyone").map((r) => `<@&${r.id}>`).join(" ") || "Aucun"
    : "—";
  const joinedTs = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;

  let kickedBy: string | null = null;
  try {
    await new Promise((r) => setTimeout(r, 800));
    const logs = await member.guild.fetchAuditLogs({ type: 20, limit: 5 });
    const entry = logs.entries.find((e) => e.target?.id === member.id && Date.now() - e.createdTimestamp < 5000);
    if (entry) kickedBy = `<@${entry.executor?.id}>`;
  } catch { /* non bloquant */ }

  const embed = new EmbedBuilder()
    .setAuthor({
      name:    kickedBy ? `${member.user?.tag ?? member.id} a été expulsé` : `${member.user?.tag ?? member.id} a quitté le serveur`,
      iconURL: member.user?.displayAvatarURL({ size: 64 }) ?? undefined,
    })
    .setColor(kickedBy ? 0xf97316 : 0xef4444)
    .setThumbnail(member.user?.displayAvatarURL({ size: 256 }) ?? null)
    .setDescription(`<@${member.id}>`)
    .addFields(
      { name: "🆔 Discord ID", value: `\`${member.id}\``, inline: true },
      ...(joinedTs  ? [{ name: "📅 Avait rejoint",  value: `<t:${joinedTs}:R>`, inline: true }] : []),
      ...(kickedBy  ? [{ name: "👢 Expulsé par",     value: kickedBy,            inline: true }] : []),
      { name: "🏷️ Rôles", value: roles, inline: false },
    )
    .setFooter({ text: `👥 ${member.guild.memberCount} membres` })
    .setTimestamp();

  sendLog(member.guild, embed);
}

// ─── Message supprimé ─────────────────────────────────────────────────────────

export async function onMessageDelete(message: Message | PartialMessage): Promise<void> {
  if (!message.guild) return;

  // Priorité : données Discord > mini-cache
  const cached = msgCache.get(message.id);
  msgCache.delete(message.id);

  const isBot     = message.author?.bot ?? cached?.isBot ?? false;
  if (isBot) return; // Ignorer les messages de bots

  const authorId     = message.author?.id    ?? cached?.authorId    ?? null;
  const authorTag    = message.author?.tag   ?? cached?.authorTag   ?? null;
  const authorAvatar = message.author?.displayAvatarURL({ size: 64 }) ?? cached?.authorAvatar ?? undefined;
  const content      = (message.content != null && message.content !== "" ? message.content : null)
                    ?? (cached?.content !== "" ? cached?.content : null)
                    ?? null;

  // Chercher qui a supprimé (si c'est un modérateur)
  let deletedBy: string | null = null;
  try {
    await new Promise((r) => setTimeout(r, 800));
    const logs = await message.guild.fetchAuditLogs({ type: 72, limit: 5 });
    const entry = logs.entries.find(
      (e) =>
        e.target?.id === authorId &&
        (e.extra as any)?.channel?.id === message.channelId &&
        Date.now() - e.createdTimestamp < 5000
    );
    if (entry) deletedBy = `<@${entry.executor?.id}>`;
  } catch { /* non bloquant */ }

  const embed = new EmbedBuilder()
    .setAuthor({
      name:    authorTag ? `${authorTag} — message supprimé` : "Message supprimé",
      iconURL: authorAvatar,
    })
    .setColor(0xf97316)
    .addFields(
      { name: "👤 Auteur",  value: authorId ? `<@${authorId}>` : "*Non identifié*", inline: true },
      { name: "📌 Salon",   value: `<#${message.channelId}>`,                       inline: true },
      ...(deletedBy ? [{ name: "🗑️ Supprimé par", value: deletedBy, inline: true }] : []),
      {
        name:  "💬 Contenu",
        value: content ? (content.length > 1000 ? content.slice(0, 1000) + "…" : content) : "*[image, fichier ou contenu non disponible]*",
        inline: false,
      },
    )
    .setFooter({ text: `ID : ${message.id}` })
    .setTimestamp();

  sendLog(message.guild, embed);
}

// ─── Message modifié ──────────────────────────────────────────────────────────

export function onMessageUpdate(old: Message | PartialMessage, msg: Message | PartialMessage): void {
  if (!msg.guild) return;
  if (msg.author?.bot) return;
  if (old.content === msg.content) return;

  const embed = new EmbedBuilder()
    .setAuthor({
      name:    `${msg.author?.tag ?? "Inconnu"} — message modifié`,
      iconURL: msg.author?.displayAvatarURL({ size: 64 }) ?? undefined,
      url:     msg.url,
    })
    .setColor(0x3b82f6)
    .addFields(
      { name: "👤 Auteur", value: msg.author ? `<@${msg.author.id}>` : "*Inconnu*", inline: true },
      { name: "📌 Salon",  value: `<#${msg.channelId}>`,                             inline: true },
      { name: "📝 Avant",  value: old.content ? old.content.slice(0, 500) : "*[non disponible]*", inline: false },
      { name: "✏️ Après",  value: msg.content ? msg.content.slice(0, 500) : "*[vide]*",           inline: false },
    )
    .setTimestamp();

  sendLog(msg.guild, embed);
}

// ─── Rôles modifiés ───────────────────────────────────────────────────────────

export function onMemberUpdate(old: GuildMember | PartialGuildMember, member: GuildMember): void {
  if (!("cache" in old.roles) || !("cache" in member.roles)) return;

  const added   = member.roles.cache.filter((r) => !old.roles.cache.has(r.id));
  const removed = old.roles.cache.filter((r) => !member.roles.cache.has(r.id));
  if (added.size === 0 && removed.size === 0) return;

  const embed = new EmbedBuilder()
    .setAuthor({ name: `${member.user.tag} — rôles modifiés`, iconURL: member.user.displayAvatarURL({ size: 64 }) })
    .setColor(0xa855f7)
    .setDescription(`<@${member.id}>`)
    .setTimestamp();

  if (added.size > 0)   embed.addFields({ name: `✅ Ajouté(s) [${added.size}]`,   value: added.map((r)   => `<@&${r.id}>`).join(" "), inline: false });
  if (removed.size > 0) embed.addFields({ name: `❌ Retiré(s) [${removed.size}]`, value: removed.map((r) => `<@&${r.id}>`).join(" "), inline: false });

  sendLog(member.guild, embed);
}

// ─── Ban / Unban ──────────────────────────────────────────────────────────────

export function onBanAdd(ban: { guild: Guild; user: User; reason: string | null }): void {
  const embed = new EmbedBuilder()
    .setAuthor({ name: `${ban.user.tag} — banni`, iconURL: ban.user.displayAvatarURL({ size: 64 }) })
    .setColor(0xdc2626)
    .setThumbnail(ban.user.displayAvatarURL({ size: 256 }))
    .setDescription(`<@${ban.user.id}>`)
    .addFields(
      { name: "🆔 Discord ID", value: `\`${ban.user.id}\``,              inline: true },
      { name: "📋 Raison",     value: ban.reason ?? "Aucune raison",     inline: false },
    )
    .setTimestamp();
  sendLog(ban.guild, embed);
}

export function onBanRemove(ban: { guild: Guild; user: User }): void {
  const embed = new EmbedBuilder()
    .setAuthor({ name: `${ban.user.tag} — débanni`, iconURL: ban.user.displayAvatarURL({ size: 64 }) })
    .setColor(0x16a34a)
    .setDescription(`<@${ban.user.id}>`)
    .addFields({ name: "🆔 Discord ID", value: `\`${ban.user.id}\``, inline: true })
    .setTimestamp();
  sendLog(ban.guild, embed);
}

// ─── Setup ────────────────────────────────────────────────────────────────────

export function setupServerLogs(client: Client): void {
  // Logs
  client.on("guildMemberAdd",    (m)     => onMemberJoin(m as GuildMember));
  client.on("guildMemberRemove", (m)     => { onMemberLeave(m as GuildMember).catch(() => {}); });
  client.on("messageDelete",     (msg)   => { onMessageDelete(msg).catch((e) => console.error("[Logs] messageDelete error:", e)); });
  client.on("messageUpdate",     (o, n)  => onMessageUpdate(o, n));
  client.on("guildMemberUpdate", (o, n)  => {
    // Auto-rôle screening
    onScreeningComplete(o, n as GuildMember).catch(() => {});
    // Logs rôles
    onMemberUpdate(o, n as GuildMember);
  });
  client.on("guildBanAdd",       (ban)   => onBanAdd(ban as any));
  client.on("guildBanRemove",    (ban)   => onBanRemove(ban as any));

  console.log("[Logs] Système de logs activé → salon", LOGS_CHANNEL_ID);
  console.log("[AutoRole] Auto-rôle screening activé → rôle", CITOYEN_ROLE_ID);
}
