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
  type Role,
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
const MSG_CACHE_MAX = 50000;

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

let logsClient: Client | null = null; // On garde le client pour fetch direct

export async function sendLog(guild: Guild, embed: EmbedBuilder): Promise<void> {
  try {
    const channel = await logsClient!.channels.fetch(LOGS_CHANNEL_ID) as TextChannel | null;
    if (!channel || !channel.isTextBased()) return;
    await channel.send({ embeds: [embed] });
  } catch (err) {
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

  // Récupérer depuis le mini-cache
  const cached = msgCache.get(message.id);
  msgCache.delete(message.id);

  // Ignorer les messages de bots
  const isBot = message.author?.bot ?? cached?.isBot ?? false;
  if (isBot) return;

  const authorId     = message.author?.id    ?? cached?.authorId    ?? null;
  const authorTag    = message.author?.tag   ?? cached?.authorTag   ?? null;
  const authorAvatar = message.author?.displayAvatarURL({ size: 64 }) ?? cached?.authorAvatar ?? undefined;
  const content      = (message.content && message.content !== "" ? message.content : null)
                    ?? (cached?.content && cached.content !== "" ? cached.content : null)
                    ?? null;

  if (!authorId) return;

  // Chercher qui a supprimé via les Audit Logs
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
      { name: "👤 Auteur", value: authorId ? `<@${authorId}>` : "*Inconnu*", inline: true },
      { name: "📌 Salon",  value: `<#${message.channelId}>`,                 inline: true },
      ...(deletedBy ? [{ name: "🗑️ Supprimé par", value: deletedBy, inline: true }] : []),
      {
        name:  "💬 Contenu",
        value: content
          ? (content.length > 1000 ? content.slice(0, 1000) + "…" : content)
          : "*[image ou fichier uniquement]*",
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
  if (!member) return;
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

// ─── Vocal ───────────────────────────────────────────────────────────────────

export function onVoiceStateUpdate(oldState: any, newState: any): void {
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;

  const guild = newState.guild ?? oldState.guild;

  // Récupérer les channels depuis le cache ou l'état
  const oldChannelId = oldState.channelId ?? oldState.channel?.id ?? null;
  const newChannelId = newState.channelId ?? newState.channel?.id ?? null;

  if (oldChannelId === newChannelId) return; // Mute/unmute/caméra — pas un mouvement

  const oldChannel = oldChannelId ? (guild.channels.cache.get(oldChannelId) ?? { id: oldChannelId }) : null;
  const newChannel = newChannelId ? (guild.channels.cache.get(newChannelId) ?? { id: newChannelId }) : null;

  let title: string;
  let color: number;
  let fields: { name: string; value: string; inline: boolean }[];

  if (!oldChannel && newChannel) {
    // Connexion
    title = `🔊 ${member.user.tag} a rejoint un salon vocal`;
    color = 0x22c55e;
    fields = [
      { name: "👤 Membre",       value: `<@${member.id}>`,          inline: true },
      { name: "🔊 Salon rejoint", value: `<#${newChannel.id}>`,      inline: true },
    ];
  } else if (oldChannel && !newChannel) {
    // Déconnexion
    title = `🔇 ${member.user.tag} a quitté un salon vocal`;
    color = 0xef4444;
    fields = [
      { name: "👤 Membre",       value: `<@${member.id}>`,          inline: true },
      { name: "🔇 Salon quitté", value: `<#${oldChannel.id}>`,      inline: true },
    ];
  } else {
    // Changement de salon
    title = `🔀 ${member.user.tag} a changé de salon vocal`;
    color = 0x3b82f6;
    fields = [
      { name: "👤 Membre",   value: `<@${member.id}>`,          inline: true },
      { name: "🔇 Avant",    value: `<#${oldChannel.id}>`,      inline: true },
      { name: "🔊 Après",    value: `<#${newChannel.id}>`,      inline: true },
    ];
  }

  const embed = new EmbedBuilder()
    .setAuthor({ name: title, iconURL: member.user.displayAvatarURL({ size: 64 }) })
    .setColor(color)
    .addFields(fields)
    .setTimestamp();

  sendLog(guild, embed);
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

// ─── Modification d'un rôle ──────────────────────────────────────────────────

export function onRoleUpdate(oldRole: Role, newRole: Role): void {
  const changes: { name: string; value: string; inline: boolean }[] = [];

  if (oldRole.name !== newRole.name)
    changes.push({ name: "📝 Nom", value: `\`${oldRole.name}\` → \`${newRole.name}\``, inline: false });

  if (oldRole.color !== newRole.color)
    changes.push({ name: "🎨 Couleur", value: `\`${oldRole.hexColor.toUpperCase()}\` → \`${newRole.hexColor.toUpperCase()}\``, inline: true });

  if (oldRole.hoist !== newRole.hoist)
    changes.push({ name: "📌 Affiché séparément", value: newRole.hoist ? "Non → ✅ Oui" : "✅ Oui → Non", inline: true });

  if (oldRole.mentionable !== newRole.mentionable)
    changes.push({ name: "🔔 Mentionnable", value: newRole.mentionable ? "Non → ✅ Oui" : "✅ Oui → Non", inline: true });

  if (oldRole.permissions.bitfield !== newRole.permissions.bitfield)
    changes.push({ name: "🔑 Permissions", value: "Modifiées", inline: true });

  if (changes.length === 0) return;

  const embed = new EmbedBuilder()
    .setTitle("🔧 Modification d'un rôle")
    .setColor(newRole.color || 0x6b7280)
    .setDescription(`<@&${newRole.id}> \`${newRole.id}\``)
    .addFields(...changes)
    .setTimestamp();

  sendLog(newRole.guild, embed);
}

// ─── Pré-chargement des messages existants ───────────────────────────────────
// Au démarrage, on pagine jusqu'à 1000 messages par salon (10 appels de 100).

export async function preCacheGuildMessages(guild: Guild): Promise<void> {
  try {
    const channels = await guild.channels.fetch();
    const textChannels = [...channels.values()].filter(
      (c) => c !== null && c.isTextBased() && !c.isDMBased()
    ) as any[];

    let totalCached = 0;
    const CONCURRENCY = 3;
    const TARGET_PER_CHANNEL = 1000;

    for (let i = 0; i < textChannels.length; i += CONCURRENCY) {
      const batch = textChannels.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(
        batch.map(async (channel) => {
          let count = 0;
          let lastId: string | undefined;

          for (let page = 0; page < TARGET_PER_CHANNEL / 100; page++) {
            const options: { limit: number; before?: string } = { limit: 100 };
            if (lastId) options.before = lastId;

            const messages = await channel.messages.fetch(options);
            if (messages.size === 0) break;

            for (const [, msg] of messages) {
              if (!msg.author || msg.author.bot) continue;
              cacheMessage(msg);
              count++;
            }

            lastId = messages.last()?.id;
            if (messages.size < 100) break;
          }

          return count;
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled") totalCached += r.value;
      }
    }

    console.log(`[Logs] Pré-cache : ${totalCached} messages depuis ${textChannels.length} salons`);
  } catch (err) {
    console.error("[Logs] Erreur pré-cache :", err);
  }
}

// ─── Setup ────────────────────────────────────────────────────────────────────

export function setupServerLogs(client: Client): void {
  logsClient = client;
  // Logs
  client.on("guildMemberAdd",    (m)     => onMemberJoin(m as GuildMember));
  client.on("guildMemberRemove", (m)     => { onMemberLeave(m as GuildMember).catch(() => {}); });
  client.on("messageDelete",     (msg)   => { onMessageDelete(msg).catch((e) => console.error("[Logs] messageDelete error:", e)); });
  client.on("messageUpdate",     (o, n)  => onMessageUpdate(o, n));
  client.on("guildMemberUpdate", (o, n)  => {
    onScreeningComplete(o, n as GuildMember).catch(() => {});
    onMemberUpdate(o, n as GuildMember);
  });
  client.on("guildBanAdd",       (ban)   => onBanAdd(ban as any));
  client.on("guildBanRemove",    (ban)   => onBanRemove(ban as any));
  client.on("voiceStateUpdate",  (o, n)  => onVoiceStateUpdate(o, n));
  client.on("roleUpdate",        (o, n)  => onRoleUpdate(o, n));

  console.log("[Logs] Système de logs activé → salon", LOGS_CHANNEL_ID);
  console.log("[AutoRole] Auto-rôle screening activé → rôle", CITOYEN_ROLE_ID);
}
