/**
 * Système de logs serveur — enregistre les événements importants dans un salon dédié.
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

const LOGS_CHANNEL_ID = "1312846003627622522";

// ─── Utilitaire ──────────────────────────────────────────────────────────────

async function sendLog(guild: Guild, embed: EmbedBuilder): Promise<void> {
  try {
    const channel = guild.channels.cache.get(LOGS_CHANNEL_ID) as TextChannel | undefined;
    if (!channel) return;
    await channel.send({ embeds: [embed] });
  } catch {
    // Non bloquant
  }
}

// ─── Membre rejoint ───────────────────────────────────────────────────────────

export function onMemberJoin(member: GuildMember): void {
  const createdTs = Math.floor(member.user.createdTimestamp / 1000);
  const accountAge = Math.floor((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24));

  const embed = new EmbedBuilder()
    .setAuthor({
      name: `${member.user.tag} a rejoint le serveur`,
      iconURL: member.user.displayAvatarURL({ size: 64 }),
    })
    .setColor(0x22c55e)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setDescription(`<@${member.id}>`)
    .addFields(
      { name: "🆔 Discord ID", value: `\`${member.id}\``, inline: true },
      { name: "📅 Compte créé", value: `<t:${createdTs}:D>\n<t:${createdTs}:R>`, inline: true },
      { name: "⚠️ Âge du compte", value: accountAge < 7 ? `⚠️ **${accountAge} jour(s)** — Compte récent !` : `${accountAge} jour(s)`, inline: true },
    )
    .setFooter({ text: `👥 ${member.guild.memberCount} membres sur le serveur` })
    .setTimestamp();

  sendLog(member.guild, embed);
}

// ─── Membre parti ─────────────────────────────────────────────────────────────

export function onMemberLeave(member: GuildMember | PartialGuildMember): void {
  const roles = !( member.roles instanceof Array)
    ? member.roles.cache
        .filter((r) => r.name !== "@everyone")
        .map((r) => `<@&${r.id}>`)
        .join(" ") || "Aucun"
    : "—";

  const joinedTs = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;

  const embed = new EmbedBuilder()
    .setAuthor({
      name: `${member.user?.tag ?? member.id} a quitté le serveur`,
      iconURL: member.user?.displayAvatarURL({ size: 64 }) ?? undefined,
    })
    .setColor(0xef4444)
    .setThumbnail(member.user?.displayAvatarURL({ size: 256 }) ?? null)
    .setDescription(`<@${member.id}>`)
    .addFields(
      { name: "🆔 Discord ID", value: `\`${member.id}\``, inline: true },
      ...(joinedTs ? [{ name: "📅 Avait rejoint", value: `<t:${joinedTs}:R>`, inline: true }] : []),
      { name: "🏷️ Rôles", value: roles, inline: false },
    )
    .setFooter({ text: `👥 ${member.guild.memberCount} membres sur le serveur` })
    .setTimestamp();

  sendLog(member.guild, embed);
}

// ─── Message supprimé ─────────────────────────────────────────────────────────

export function onMessageDelete(message: Message | PartialMessage): void {
  if (!message.guild) return;
  if (message.author?.bot) return;

  const embed = new EmbedBuilder()
    .setAuthor({
      name: message.author ? `${message.author.tag} — message supprimé` : "Message supprimé",
      iconURL: message.author?.displayAvatarURL({ size: 64 }) ?? undefined,
    })
    .setColor(0xf97316)
    .addFields(
      { name: "👤 Auteur", value: message.author ? `<@${message.author.id}>` : "Inconnu", inline: true },
      { name: "📌 Salon", value: `<#${message.channelId}>`, inline: true },
      {
        name: "💬 Contenu",
        value: message.content
          ? (message.content.length > 1000 ? message.content.slice(0, 1000) + "…" : message.content)
          : "*[vide ou non mis en cache]*",
        inline: false,
      },
    )
    .setFooter({ text: `ID message : ${message.id}` })
    .setTimestamp();

  sendLog(message.guild, embed);
}

// ─── Message modifié ──────────────────────────────────────────────────────────

export function onMessageUpdate(
  oldMessage: Message | PartialMessage,
  newMessage: Message | PartialMessage
): void {
  if (!newMessage.guild) return;
  if (newMessage.author?.bot) return;
  if (oldMessage.content === newMessage.content) return;

  const embed = new EmbedBuilder()
    .setAuthor({
      name: `${newMessage.author?.tag ?? "Inconnu"} — message modifié`,
      iconURL: newMessage.author?.displayAvatarURL({ size: 64 }) ?? undefined,
      url: newMessage.url,
    })
    .setColor(0x3b82f6)
    .addFields(
      { name: "👤 Auteur", value: newMessage.author ? `<@${newMessage.author.id}>` : "Inconnu", inline: true },
      { name: "📌 Salon", value: `<#${newMessage.channelId}>`, inline: true },
      {
        name: "📝 Avant",
        value: oldMessage.content
          ? (oldMessage.content.length > 500 ? oldMessage.content.slice(0, 500) + "…" : oldMessage.content)
          : "*[non mis en cache]*",
        inline: false,
      },
      {
        name: "✏️ Après",
        value: newMessage.content
          ? (newMessage.content.length > 500 ? newMessage.content.slice(0, 500) + "…" : newMessage.content)
          : "*[vide]*",
        inline: false,
      },
    )
    .setFooter({ text: "Cliquez sur l'auteur pour voir le message" })
    .setTimestamp();

  sendLog(newMessage.guild, embed);
}

// ─── Rôles modifiés ───────────────────────────────────────────────────────────

export function onMemberUpdate(
  oldMember: GuildMember | PartialGuildMember,
  newMember: GuildMember
): void {
  if (!("cache" in oldMember.roles) || !("cache" in newMember.roles)) return;

  const added   = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
  const removed = oldMember.roles.cache.filter((r) => !newMember.roles.cache.has(r.id));

  if (added.size === 0 && removed.size === 0) return;

  const embed = new EmbedBuilder()
    .setAuthor({
      name: `${newMember.user.tag} — rôles modifiés`,
      iconURL: newMember.user.displayAvatarURL({ size: 64 }),
    })
    .setColor(0xa855f7)
    .setDescription(`<@${newMember.id}>`)
    .setTimestamp();

  if (added.size > 0) {
    embed.addFields({ name: `✅ Rôle(s) ajouté(s) [${added.size}]`, value: added.map((r) => `<@&${r.id}>`).join(" "), inline: false });
  }
  if (removed.size > 0) {
    embed.addFields({ name: `❌ Rôle(s) retiré(s) [${removed.size}]`, value: removed.map((r) => `<@&${r.id}>`).join(" "), inline: false });
  }

  sendLog(newMember.guild, embed);
}

// ─── Ban / Unban ──────────────────────────────────────────────────────────────

export function onBanAdd(ban: { guild: Guild; user: User; reason: string | null }): void {
  const embed = new EmbedBuilder()
    .setAuthor({
      name: `${ban.user.tag} — banni du serveur`,
      iconURL: ban.user.displayAvatarURL({ size: 64 }),
    })
    .setColor(0xdc2626)
    .setThumbnail(ban.user.displayAvatarURL({ size: 256 }))
    .setDescription(`<@${ban.user.id}>`)
    .addFields(
      { name: "🆔 Discord ID", value: `\`${ban.user.id}\``, inline: true },
      { name: "📋 Raison", value: ban.reason ?? "Aucune raison fournie", inline: false },
    )
    .setTimestamp();

  sendLog(ban.guild, embed);
}

export function onBanRemove(ban: { guild: Guild; user: User }): void {
  const embed = new EmbedBuilder()
    .setAuthor({
      name: `${ban.user.tag} — débanni`,
      iconURL: ban.user.displayAvatarURL({ size: 64 }),
    })
    .setColor(0x16a34a)
    .setDescription(`<@${ban.user.id}>`)
    .addFields(
      { name: "🆔 Discord ID", value: `\`${ban.user.id}\``, inline: true },
    )
    .setTimestamp();

  sendLog(ban.guild, embed);
}

// ─── Setup ────────────────────────────────────────────────────────────────────

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
