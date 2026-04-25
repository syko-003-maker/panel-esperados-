/**
 * Système de logs serveur — enregistre les événements importants dans un salon dédié.
 *
 * Événements couverts :
 * - Membre rejoint / quitte le serveur
 * - Message supprimé
 * - Message modifié
 * - Rôle ajouté / retiré à un membre
 * - Membre banni / débanni
 */

import {
  Client,
  EmbedBuilder,
  AuditLogEvent,
  type GuildMember,
  type PartialGuildMember,
  type Message,
  type PartialMessage,
  type TextChannel,
  type Guild,
  type User,
} from "discord.js";

// ID du salon logs
const LOGS_CHANNEL_ID = "1312846003627622522";

// ─── Utilitaire : envoyer dans le salon logs ──────────────────────────────────

async function sendLog(guild: Guild, embed: EmbedBuilder): Promise<void> {
  try {
    const channel = guild.channels.cache.get(LOGS_CHANNEL_ID) as TextChannel | undefined;
    if (!channel) return;
    await channel.send({ embeds: [embed] });
  } catch {
    // Non bloquant
  }
}

function now(): string {
  return `<t:${Math.floor(Date.now() / 1000)}:F>`;
}

// ─── Événements membres ───────────────────────────────────────────────────────

export function onMemberJoin(member: GuildMember): void {
  const embed = new EmbedBuilder()
    .setTitle("📥 Membre rejoint")
    .setColor(0x22c55e)
    .setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name: "Utilisateur", value: `<@${member.id}> \`${member.user.tag}\``, inline: true },
      { name: "ID", value: member.id, inline: true },
      { name: "Compte créé le", value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
    )
    .setFooter({ text: `Membres : ${member.guild.memberCount}` })
    .setTimestamp();

  sendLog(member.guild, embed);
}

export function onMemberLeave(member: GuildMember | PartialGuildMember): void {
  const embed = new EmbedBuilder()
    .setTitle("📤 Membre parti")
    .setColor(0xef4444)
    .setThumbnail(member.user?.displayAvatarURL() ?? null)
    .addFields(
      { name: "Utilisateur", value: `<@${member.id}> \`${member.user?.tag ?? member.id}\``, inline: true },
      { name: "ID", value: member.id, inline: true },
      { name: "Rôles", value: member.roles instanceof Array ? "-" : (member.roles.cache.map((r: any) => r.name).filter((n: string) => n !== "@everyone").join(", ") || "Aucun"), inline: false },
    )
    .setFooter({ text: `Membres : ${member.guild.memberCount}` })
    .setTimestamp();

  sendLog(member.guild, embed);
}

// ─── Événements messages ──────────────────────────────────────────────────────

export function onMessageDelete(message: Message | PartialMessage): void {
  if (!message.guild) return;
  if (message.author?.bot) return;

  const embed = new EmbedBuilder()
    .setTitle("🗑️ Message supprimé")
    .setColor(0xf97316)
    .addFields(
      { name: "Auteur", value: message.author ? `<@${message.author.id}> \`${message.author.tag}\`` : "Inconnu", inline: true },
      { name: "Salon", value: `<#${message.channelId}>`, inline: true },
      { name: "Contenu", value: message.content ? (message.content.length > 1000 ? message.content.slice(0, 1000) + "…" : message.content) : "*[vide ou non mis en cache]*", inline: false },
    )
    .setTimestamp();

  sendLog(message.guild, embed);
}

export function onMessageUpdate(
  oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage
): void {
  if (!newMessage.guild) return;
  if (newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return; // Ignore embeds auto-ajoutés

  const embed = new EmbedBuilder()
    .setTitle("✏️ Message modifié")
    .setColor(0x3b82f6)
    .setURL(newMessage.url)
    .addFields(
      { name: "Auteur", value: newMessage.author ? `<@${newMessage.author.id}> \`${newMessage.author.tag}\`` : "Inconnu", inline: true },
      { name: "Salon", value: `<#${newMessage.channelId}>`, inline: true },
      { name: "Avant", value: oldMessage.content ? (oldMessage.content.length > 500 ? oldMessage.content.slice(0, 500) + "…" : oldMessage.content) : "*[non mis en cache]*", inline: false },
      { name: "Après", value: newMessage.content ? (newMessage.content.length > 500 ? newMessage.content.slice(0, 500) + "…" : newMessage.content) : "*[vide]*", inline: false },
    )
    .setTimestamp();

  sendLog(newMessage.guild, embed);
}

// ─── Changements de rôles ─────────────────────────────────────────────────────

export function onMemberUpdate(
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember
): void {
  if (!("cache" in oldMember.roles) || !("cache" in newMember.roles)) return;

  const oldRoles = oldMember.roles.cache;
  const newRoles = newMember.roles.cache;

  const added   = newRoles.filter((r) => !oldRoles.has(r.id));
  const removed = oldRoles.filter((r) => !newRoles.has(r.id));

  if (added.size === 0 && removed.size === 0) return;

  const embed = new EmbedBuilder()
    .setTitle("🔄 Rôles modifiés")
    .setColor(0xa855f7)
    .addFields(
      { name: "Membre", value: `<@${newMember.id}> \`${newMember.user.tag}\``, inline: true },
    );

  if (added.size > 0) {
    embed.addFields({ name: "✅ Rôle(s) ajouté(s)", value: added.map((r) => `<@&${r.id}>`).join(", "), inline: false });
  }
  if (removed.size > 0) {
    embed.addFields({ name: "❌ Rôle(s) retiré(s)", value: removed.map((r) => `<@&${r.id}>`).join(", "), inline: false });
  }

  embed.setTimestamp();
  sendLog(newMember.guild, embed);
}

// ─── Bans ─────────────────────────────────────────────────────────────────────

export function onBanAdd(ban: { guild: Guild; user: User; reason: string | null }): void {
  const embed = new EmbedBuilder()
    .setTitle("🔨 Membre banni")
    .setColor(0xdc2626)
    .setThumbnail(ban.user.displayAvatarURL())
    .addFields(
      { name: "Utilisateur", value: `<@${ban.user.id}> \`${ban.user.tag}\``, inline: true },
      { name: "ID", value: ban.user.id, inline: true },
      { name: "Raison", value: ban.reason ?? "Aucune raison fournie", inline: false },
    )
    .setTimestamp();

  sendLog(ban.guild, embed);
}

export function onBanRemove(ban: { guild: Guild; user: User }): void {
  const embed = new EmbedBuilder()
    .setTitle("✅ Membre débanni")
    .setColor(0x16a34a)
    .addFields(
      { name: "Utilisateur", value: `<@${ban.user.id}> \`${ban.user.tag}\``, inline: true },
      { name: "ID", value: ban.user.id, inline: true },
    )
    .setTimestamp();

  sendLog(ban.guild, embed);
}

// ─── Setup : branche tous les listeners ──────────────────────────────────────

export function setupServerLogs(client: Client): void {
  client.on("guildMemberAdd",    (member) => onMemberJoin(member as GuildMember));
  client.on("guildMemberRemove", (member) => onMemberLeave(member as GuildMember));
  client.on("messageDelete",     (msg)    => onMessageDelete(msg));
  client.on("messageUpdate",     (o, n)   => onMessageUpdate(o, n));
  client.on("guildMemberUpdate", (o, n)   => onMemberUpdate(o, n as GuildMember));
  client.on("guildBanAdd",       (ban)    => onBanAdd(ban as any));
  client.on("guildBanRemove",    (ban)    => onBanRemove(ban as any));

  console.log("[Logs] Système de logs serveur activé → salon", LOGS_CHANNEL_ID);
}
