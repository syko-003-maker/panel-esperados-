/**
 * Helper pour logger les commandes Discord staff dans :
 *   1. Le salon Discord des logs serveur (#logs)  → traçabilité visible
 *      par tous les staff en temps réel.
 *   2. La table AuditLog du panel                  → requêtable depuis
 *      /staff/system ou /staff/audit, conservé même si Discord purge ses
 *      messages.
 *
 * Cible : commandes à fort impact public (annonce-recrutement,
 * reglement-post, linkpanel, etc.). Pas les commandes de pure lecture
 * (/member, /warns) qui n'ont aucun effet de bord.
 *
 * Usage dans une command handler :
 *
 *   await logAdminCommand({
 *     interaction,
 *     action: "DISCORD_ANNOUNCEMENT_POSTED",
 *     label: "Annonce de recrutement publiée",
 *     targetChannelId: ANNONCE_CHANNEL_ID,
 *   });
 */

import { EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import { PrismaClient } from "@prisma/client";
import { sendLog } from "../features/logs/serverLogs.js";

const prisma = new PrismaClient();
const FAMILY_ID = process.env.FAMILY_ID ?? "esperados";

export type AdminCommandLogOptions = {
  interaction: ChatInputCommandInteraction;
  /**
   * Slug technique pour l'AuditLog.action — UPPER_SNAKE_CASE conseillé.
   * Ex: "DISCORD_ANNOUNCEMENT_POSTED".
   */
  action: string;
  /**
   * Libellé lisible affiché dans l'embed Discord + AuditLog.entityName.
   * Ex: "Annonce de recrutement publiée".
   */
  label: string;
  /** Description longue facultative (affichée comme champ "Détails"). */
  detail?: string;
  /**
   * Salon ciblé par l'action — mis en évidence dans l'embed avec un mention
   * cliquable (`<#id>`). Laisser undefined si non applicable.
   */
  targetChannelId?: string | null;
  /** Entité AuditLog — défaut "DiscordCommand". */
  entity?: string;
  /** ID de l'entité — défaut = nom de la commande Discord. */
  entityId?: string;
};

export async function logAdminCommand(opts: AdminCommandLogOptions): Promise<void> {
  const { interaction, action, label, detail, targetChannelId } = opts;
  const userId = interaction.user.id;
  const userTag = interaction.user.tag;
  const guildId = interaction.guildId ?? null;

  // ─── 1. Embed dans le channel #logs Discord ─────────────────────────────
  try {
    if (interaction.guild) {
      const fields: { name: string; value: string; inline?: boolean }[] = [
        { name: "🛠️  Action", value: `**${label}**`, inline: false },
        { name: "💬  Commande", value: `\`/${interaction.commandName}\``, inline: true },
      ];
      if (targetChannelId) {
        fields.push({ name: "📺  Salon cible", value: `<#${targetChannelId}>`, inline: true });
      }
      if (detail) {
        fields.push({ name: "📋  Détails", value: detail, inline: false });
      }

      const embed = new EmbedBuilder()
        .setAuthor({
          name: `${userTag} — commande staff`,
          iconURL: interaction.user.displayAvatarURL({ size: 64 }),
        })
        .setColor(0xf59e0b) // ambre — action staff notable mais non destructive
        .setDescription(`<@${userId}>`)
        .addFields(fields)
        .setTimestamp()
        .setFooter({ text: "Los Esperados  •  Audit commande staff" });

      await sendLog(interaction.guild, embed);
    }
  } catch (e) {
    console.error("[logAdminCommand] Discord log failed:", e);
  }

  // ─── 2. AuditLog dans la DB du panel ────────────────────────────────────
  try {
    await prisma.auditLog.create({
      data: {
        familyId: FAMILY_ID,
        actorType: "staff",
        actorId: userId,
        actorName: userTag,
        action,
        entity: opts.entity ?? "DiscordCommand",
        entityId: opts.entityId ?? interaction.commandName,
        entityName: label,
        meta: {
          guildId,
          discordCommand: interaction.commandName,
          targetChannelId: targetChannelId ?? null,
          detail: detail ?? null,
        } as any,
      },
    });
  } catch (e) {
    console.error("[logAdminCommand] DB audit failed:", e);
  }
}
