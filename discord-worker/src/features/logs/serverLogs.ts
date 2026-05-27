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
import { PrismaClient } from "@prisma/client";

const LOGS_CHANNEL_ID    = "1312846003627622522";
const WELCOME_CHANNEL_ID = "1336727638227685426"; // 🎉 Bienvenue publique
const RULES_CHANNEL_ID   = "1312846003358924875"; // 📜 Règlement
const CONTACT_CHANNEL_ID = "1312846003627622524"; // 📬 Contact / recrutement
const CITOYEN_ROLE_ID    = "1337795596739940372";
const BLACKLIST_ROLE_ID  = "1338901141873758288";

const prisma = new PrismaClient();

// ─── Mini-cache messages ──────────────────────────────────────────────────────

interface CachedMsg {
  authorId: string;
  authorTag: string;
  authorAvatar: string | null;
  content: string;
  channelId: string;
  isBot: boolean;
  attachments: string[]; // URLs des pièces jointes
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
    authorId:     message.author.id,
    authorTag:    message.author.tag,
    authorAvatar: message.author.displayAvatarURL({ size: 64 }),
    content:      message.content ?? "",
    channelId:    message.channelId,
    isBot:        message.author.bot,
    attachments:  message.attachments.map((a) => a.proxyURL || a.url),
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

/**
 * Envoie un message de bienvenue public dans le channel #bienvenue.
 * Mentionne le membre + embed avec sa photo de profil + nb membres total.
 */
async function sendWelcomeMessage(member: GuildMember): Promise<void> {
  try {
    const channel = (await logsClient!.channels.fetch(WELCOME_CHANNEL_ID)) as TextChannel | null;
    if (!channel || !channel.isTextBased()) {
      console.warn("[Welcome] Channel introuvable ou non-textuel :", WELCOME_CHANNEL_ID);
      return;
    }

    // Cherche un nom humain dans cet ordre : nickname serveur → global_name
    // Discord → username (handle) → display name (peut être l'ID si le compte
    // est désactivé/supprimé). Si tout est numérique (cas Discord delete user),
    // on tombe sur "Nouveau membre" pour ne pas afficher une suite de chiffres.
    const isJustDigits = (s: string | null | undefined) => /^\d{15,25}$/.test((s ?? "").trim());
    const candidates = [
      member.nickname,
      member.user.globalName,
      member.user.username,
      member.displayName,
    ];
    let displayName = "Nouveau membre";
    for (const c of candidates) {
      const v = (c ?? "").trim();
      if (v && !isJustDigits(v)) { displayName = v; break; }
    }
    const avatarUrl = member.user.displayAvatarURL({ size: 256, extension: "png" });

    const embed = new EmbedBuilder()
      .setColor(0x9b2335) // bordeaux Los Esperados
      .setAuthor({ name: "🎉 Un nouveau membre rejoint la famille !" })
      .setTitle(`Bienvenue ${displayName} !`)
      .setDescription(
        [
          `Salut <@${member.id}>, content de te voir parmi nous sur **Los Esperados** 🌵`,
          ``,
          `📜 N'oublie pas de lire le règlement → <#${RULES_CHANNEL_ID}>`,
          `📬 Si tu souhaites rentrer en contact avec nous ou te faire recruter → <#${CONTACT_CHANNEL_ID}>`,
        ].join("\n"),
      )
      .setThumbnail(avatarUrl)
      .addFields({ name: "👤 Pseudo", value: displayName, inline: true })
      .setFooter({ text: "Los Esperados • Discord LYG" })
      .setTimestamp();

    await channel.send({
      content: `🎉 <@${member.id}> 🎉`,
      embeds: [embed],
      allowedMentions: { users: [member.id] },
    });
  } catch (err) {
    console.error("[Welcome] Erreur envoi message bienvenue :", err);
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

export async function onMemberJoin(member: GuildMember): Promise<void> {
  const createdTs  = Math.floor(member.user.createdTimestamp / 1000);
  const accountAge = Math.floor((Date.now() - member.user.createdTimestamp) / 86_400_000);

  // ── Vérification blacklist ────────────────────────────────────────────────
  let isBlacklisted = false;
  try {
    const blacklistSanction = await prisma.sanction.findFirst({
      where: {
        discordId: member.id,
        type: "BLACKLIST",
        status: "ACTIVE",
        clearedAt: null,
      },
      select: { id: true },
    });

    if (blacklistSanction) {
      isBlacklisted = true;
      // Appliquer le rôle blacklist immédiatement
      await member.roles.add(BLACKLIST_ROLE_ID, "Blacklist active — rôle réappliqué au rejoint");

      // Mettre à jour le statut Discord de la sanction
      await prisma.sanction.update({
        where: { id: blacklistSanction.id },
        data: { discordStatus: "APPLIED", discordAppliedAt: new Date(), discordError: null } as any,
      });

      console.log(`[Blacklist] Rôle blacklist réappliqué à ${member.user.tag} (${member.id}) au rejoint`);
    }
  } catch (err) {
    console.error("[Blacklist] Erreur vérification blacklist au rejoint:", err);
  }

  const embed = new EmbedBuilder()
    .setAuthor({
      name:    `${member.user.tag} a rejoint le serveur`,
      iconURL: member.user.displayAvatarURL({ size: 64 }),
    })
    .setColor(isBlacklisted ? 0xef4444 : 0x22c55e)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setDescription(isBlacklisted ? `⛔ <@${member.id}> — **BLACKLISTÉ** — Rôle réappliqué automatiquement` : `<@${member.id}>`)
    .addFields(
      { name: "🆔 Discord ID",   value: `\`${member.id}\``,                                                                              inline: true },
      { name: "📅 Compte créé",  value: `<t:${createdTs}:D>\n<t:${createdTs}:R>`,                                                        inline: true },
      { name: "⚠️ Âge du compte", value: accountAge < 7 ? `⚠️ **${accountAge} jour(s)** — Compte récent !` : `${accountAge} jour(s)`, inline: true },
    )
    .setFooter({ text: `👥 ${member.guild.memberCount} membres` })
    .setTimestamp();

  sendLog(member.guild, embed);

  // Message de bienvenue public — uniquement si NON blacklisté.
  // (On ne souhaite pas la bienvenue à quelqu'un qu'on vient de re-banner.)
  if (!isBlacklisted) {
    await sendWelcomeMessage(member);
  }
}

// ─── Membre parti / kick ─────────────────────────────────────────────────────

export async function onMemberLeave(member: GuildMember | PartialGuildMember): Promise<void> {
  const roles = !( member.roles instanceof Array)
    ? member.roles.cache.filter((r) => r.name !== "@everyone").map((r) => `<@&${r.id}>`).join(" ") || "Aucun"
    : "—";
  const joinedTs = member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null;

  // Récupère exécuteur ET raison via l'audit log (type 20 = MEMBER_KICK).
  // Avant : on ne lisait que l'exécuteur, la raison était perdue.
  let kickedBy: string | null = null;
  let kickReason: string | null = null;
  try {
    await new Promise((r) => setTimeout(r, 800));
    const logs = await member.guild.fetchAuditLogs({ type: 20, limit: 5 });
    const entry = logs.entries.find(
      (e) => e.target?.id === member.id && Date.now() - e.createdTimestamp < 5000,
    );
    if (entry) {
      if (entry.executor?.id) kickedBy = `<@${entry.executor.id}>`;
      // Notre /kick passe "modTag : raison" — on coupe le préfixe.
      if (entry.reason) {
        const m =
          entry.reason.match(/^[^:]+#\d{1,5}\s*:\s*(.+)$/) ??
          entry.reason.match(/^[^:\n]{1,32}\s*:\s*(.+)$/);
        kickReason = m ? m[1].trim() : entry.reason;
      }
    }
  } catch { /* non bloquant */ }

  const embed = new EmbedBuilder()
    .setAuthor({
      name:    kickedBy ? `${member.user?.tag ?? member.id} a été expulsé` : `${member.user?.tag ?? member.id} a quitté le serveur`,
      iconURL: member.user?.displayAvatarURL({ size: 64 }) ?? undefined,
    })
    .setColor(kickedBy ? 0xf97316 : 0xef4444)
    .setThumbnail(member.user?.displayAvatarURL({ size: 256 }) ?? null)
    .setDescription(`**${member.user?.tag ?? "Compte supprimé"}** · \`${member.id}\``)
    .addFields(
      { name: "🆔 Discord ID", value: `\`${member.id}\``, inline: true },
      ...(joinedTs  ? [{ name: "📅 Avait rejoint",  value: `<t:${joinedTs}:R>`, inline: true }] : []),
      ...(kickedBy  ? [{ name: "👢 Expulsé par",     value: kickedBy,            inline: true }] : []),
      ...(kickedBy && kickReason
        ? [{ name: "📋 Raison", value: kickReason, inline: false }]
        : []),
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
  const attachments  = cached?.attachments ?? [...(message.attachments?.values() ?? [])].map((a) => a.proxyURL || a.url);

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
          : "*[aucun texte]*",
        inline: false,
      },
      ...(attachments.length > 0 ? [{
        name:  `📎 Pièce(s) jointe(s) [${attachments.length}]`,
        value: attachments.slice(0, 5).join("\n"),
        inline: false,
      }] : []),
    )
    .setFooter({ text: `ID : ${message.id}` })
    .setTimestamp();

  // Si le message était une image seule, l'afficher dans l'embed
  const imageUrl = attachments.find((u) => /\.(png|jpe?g|gif|webp)(\?|$)/i.test(u));
  if (imageUrl) embed.setImage(imageUrl);

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

export async function onMemberUpdate(old: GuildMember | PartialGuildMember, member: GuildMember): Promise<void> {
  if (!member) return;
  // Si old est partial (pas en cache), ses rôles sont vides → faux positifs, on ignore
  if (old.partial) return;
  if (!("cache" in old.roles) || !("cache" in member.roles)) return;

  const added   = member.roles.cache.filter((r) => !old.roles.cache.has(r.id));
  const removed = old.roles.cache.filter((r) => !member.roles.cache.has(r.id));
  if (added.size === 0 && removed.size === 0) return;

  // Chercher qui a modifié les rôles via les Audit Logs (type 25 = MEMBER_ROLE_UPDATE)
  let modifiedBy: string | null = null;
  try {
    await new Promise((r) => setTimeout(r, 800));
    const logs = await member.guild.fetchAuditLogs({ type: 25, limit: 5 });
    const entry = logs.entries.find(
      (e) => e.target?.id === member.id && Date.now() - e.createdTimestamp < 5000
    );
    if (entry && entry.executor && entry.executor.id !== member.id) {
      modifiedBy = `<@${entry.executor.id}>`;
    }
  } catch { /* non bloquant */ }

  const embed = new EmbedBuilder()
    .setAuthor({ name: `${member.user.tag} — rôles modifiés`, iconURL: member.user.displayAvatarURL({ size: 64 }) })
    .setColor(0xa855f7)
    .setDescription(`**${member.user.tag}** · \`${member.id}\``)
    .setTimestamp();

  if (modifiedBy) embed.addFields({ name: "👤 Modifié par", value: modifiedBy, inline: true });
  if (added.size > 0)   embed.addFields({ name: `✅ Ajouté(s) [${added.size}]`,   value: added.map((r)   => `<@&${r.id}>`).join(" "), inline: false });
  if (removed.size > 0) embed.addFields({ name: `❌ Retiré(s) [${removed.size}]`, value: removed.map((r) => `<@&${r.id}>`).join(" "), inline: false });

  sendLog(member.guild, embed);
}

// ─── Vocal ───────────────────────────────────────────────────────────────────

export async function onVoiceStateUpdate(oldState: any, newState: any): Promise<void> {
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;

  const guild = newState.guild ?? oldState.guild;

  const oldChannelId = oldState.channelId ?? oldState.channel?.id ?? null;
  const newChannelId = newState.channelId ?? newState.channel?.id ?? null;

  if (oldChannelId === newChannelId) return;

  const oldChannel = oldChannelId ? (guild.channels.cache.get(oldChannelId) ?? { id: oldChannelId }) : null;
  const newChannel = newChannelId ? (guild.channels.cache.get(newChannelId) ?? { id: newChannelId }) : null;

  // Détecter si un modérateur a déplacé le membre (audit log type 26 = MEMBER_MOVE)
  let movedBy: string | null = null;
  if (oldChannel && newChannel) {
    try {
      await new Promise((r) => setTimeout(r, 600));
      const logs = await guild.fetchAuditLogs({ type: 26, limit: 5 });
      const entry = logs.entries.find(
        (e: any) =>
          e.executor?.id !== member.id &&
          Date.now() - e.createdTimestamp < 5000
      );
      if (entry) movedBy = `<@${entry.executor?.id}>`;
    } catch { /* non bloquant */ }
  }

  let title: string;
  let color: number;
  let fields: { name: string; value: string; inline: boolean }[];

  if (!oldChannel && newChannel) {
    title = `🔊 ${member.user.tag} a rejoint un salon vocal`;
    color = 0x22c55e;
    fields = [
      { name: "👤 Membre",       value: `<@${member.id}>`, inline: true },
      { name: "🔊 Salon rejoint", value: `<#${newChannel.id}>`, inline: true },
    ];
  } else if (oldChannel && !newChannel) {
    title = `🔇 ${member.user.tag} a quitté un salon vocal`;
    color = 0xef4444;
    fields = [
      { name: "👤 Membre",       value: `<@${member.id}>`, inline: true },
      { name: "🔇 Salon quitté", value: `<#${oldChannel.id}>`, inline: true },
    ];
  } else {
    title = movedBy
      ? `🔀 ${member.user.tag} a été déplacé dans un salon vocal`
      : `🔀 ${member.user.tag} a changé de salon vocal`;
    color = 0x3b82f6;
    fields = [
      { name: "👤 Membre", value: `<@${member.id}>`,     inline: true },
      { name: "🔇 Avant",  value: `<#${oldChannel.id}>`, inline: true },
      { name: "🔊 Après",  value: `<#${newChannel.id}>`, inline: true },
      ...(movedBy ? [{ name: "👮 Déplacé par", value: movedBy, inline: true }] : []),
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

/**
 * Extrait la raison + l'exécuteur d'un ban depuis l'audit log.
 *
 * Pourquoi ce fetch manuel : l'event Discord `guildBanAdd` est émis AVANT
 * que la raison + l'auteur ne soient propagés au cache discord.js — donc
 * `ban.reason` est presque toujours `null`. La seule façon fiable de
 * récupérer ces infos est de lire l'audit log juste après (type 22 =
 * MEMBER_BAN_ADD), en filtrant par target.id et un timestamp récent.
 *
 * Notre commande /ban passe la raison au format "modTag : raison" → on
 * coupe le préfixe pour ne garder que la raison côté embed.
 */
async function fetchBanAuditDetails(
  guild: Guild,
  targetId: string,
  fallbackReason: string | null,
): Promise<{ reason: string | null; executorId: string | null }> {
  // Petite latence pour laisser à Discord le temps d'écrire l'audit log.
  await new Promise((r) => setTimeout(r, 800));
  let executorId: string | null = null;
  let auditReason: string | null = null;
  try {
    const logs = await guild.fetchAuditLogs({ type: 22, limit: 5 });
    const entry = logs.entries.find(
      (e) => e.target?.id === targetId && Date.now() - e.createdTimestamp < 10_000,
    );
    if (entry) {
      executorId  = entry.executor?.id ?? null;
      auditReason = entry.reason ?? null;
    }
  } catch {
    /* permission manquante ou erreur réseau → fallback */
  }

  // On préfère la raison de l'audit log (incluse à coup sûr quand /ban est
  // utilisée). Si vide, on tente fallbackReason (= ban.reason event).
  let reason = auditReason ?? fallbackReason ?? null;

  // /ban formate en "User#1234 : <raison>" — on retire le préfixe modTag
  // pour ne pas le dupliquer avec le champ "Banni par" affiché à côté.
  if (reason) {
    const m = reason.match(/^[^:]+#\d{1,5}\s*:\s*(.+)$/);
    if (m) reason = m[1].trim();
    // Format alternatif possible (sans discriminator) : "username : raison"
    if (!m) {
      const m2 = reason.match(/^[^:\n]{1,32}\s*:\s*(.+)$/);
      if (m2) reason = m2[1].trim();
    }
  }
  return { reason, executorId };
}

export async function onBanAdd(ban: {
  guild: Guild;
  user: User;
  reason: string | null;
}): Promise<void> {
  const { reason, executorId } = await fetchBanAuditDetails(
    ban.guild,
    ban.user.id,
    ban.reason,
  );

  const embed = new EmbedBuilder()
    .setAuthor({
      name: `${ban.user.tag} — banni`,
      iconURL: ban.user.displayAvatarURL({ size: 64 }),
    })
    .setColor(0xdc2626)
    .setThumbnail(ban.user.displayAvatarURL({ size: 256 }))
    .setDescription(`<@${ban.user.id}>`)
    .addFields(
      { name: "🆔 Discord ID", value: `\`${ban.user.id}\``, inline: true },
      ...(executorId
        ? [{ name: "👮 Banni par", value: `<@${executorId}>`, inline: true }]
        : []),
      {
        name: "📋 Raison",
        value: reason && reason.trim() !== "" ? reason : "_Aucune raison fournie_",
        inline: false,
      },
    )
    .setTimestamp();
  sendLog(ban.guild, embed);
}

export async function onBanRemove(ban: { guild: Guild; user: User }): Promise<void> {
  // Idem : on cherche qui a débanni dans l'audit log (type 23 = MEMBER_BAN_REMOVE).
  let executorId: string | null = null;
  try {
    await new Promise((r) => setTimeout(r, 800));
    const logs = await ban.guild.fetchAuditLogs({ type: 23, limit: 5 });
    const entry = logs.entries.find(
      (e) => e.target?.id === ban.user.id && Date.now() - e.createdTimestamp < 10_000,
    );
    if (entry) executorId = entry.executor?.id ?? null;
  } catch {
    /* non bloquant */
  }

  const embed = new EmbedBuilder()
    .setAuthor({
      name: `${ban.user.tag} — débanni`,
      iconURL: ban.user.displayAvatarURL({ size: 64 }),
    })
    .setColor(0x16a34a)
    .setDescription(`<@${ban.user.id}>`)
    .addFields(
      { name: "🆔 Discord ID", value: `\`${ban.user.id}\``, inline: true },
      ...(executorId
        ? [{ name: "👮 Débanni par", value: `<@${executorId}>`, inline: true }]
        : []),
    )
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
  client.on("guildMemberAdd",    (m)     => { onMemberJoin(m as GuildMember).catch((e) => console.error("[Logs] guildMemberAdd error:", e)); });
  client.on("guildMemberRemove", (m)     => { onMemberLeave(m as GuildMember).catch(() => {}); });
  client.on("messageDelete",     (msg)   => { onMessageDelete(msg).catch((e) => console.error("[Logs] messageDelete error:", e)); });
  client.on("messageUpdate",     (o, n)  => onMessageUpdate(o, n));
  client.on("guildMemberUpdate", (o, n)  => {
    onScreeningComplete(o, n as GuildMember).catch(() => {});
    onMemberUpdate(o, n as GuildMember).catch(() => {});
  });
  client.on("guildBanAdd",       (ban)   => { onBanAdd(ban as any).catch((e) => console.error("[Logs] onBanAdd error:", e)); });
  client.on("guildBanRemove",    (ban)   => { onBanRemove(ban as any).catch((e) => console.error("[Logs] onBanRemove error:", e)); });
  client.on("voiceStateUpdate",  (o, n)  => { onVoiceStateUpdate(o, n).catch(() => {}); });
  client.on("roleUpdate",        (o, n)  => onRoleUpdate(o, n));

  console.log("[Logs] Système de logs activé → salon", LOGS_CHANNEL_ID);
  console.log("[AutoRole] Auto-rôle screening activé → rôle", CITOYEN_ROLE_ID);
}
