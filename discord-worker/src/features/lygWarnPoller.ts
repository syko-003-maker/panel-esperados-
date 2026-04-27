/**
 * LYG Warn Poller — stockage DB + notifications uniquement pour les nouveaux warns
 *
 * Logique :
 * 1. Fetch LYG /warns/:steamId pour chaque membre actif (séquentiel, 300ms délai)
 * 2. Pour chaque warn reçu : upsert en DB via la clé unique (steamId+warnDate+type)
 * 3. Si le warn est nouveau (non encore notifié) → embed Discord + marqué notified=true
 * 4. Pas d'appel LYG si rate-limité : on arrête proprement et on réessaie au prochain cycle
 */

import { Client, EmbedBuilder, TextChannel } from "discord.js";
import type { PrismaClient } from "@prisma/client";

const LYG_BASE_URL = process.env.LYG_BASE_URL ?? "https://api.lyg.fr/api";
const LYG_TOKEN    = process.env.LYG_TOKEN ?? "";

type LygWarnRaw = {
  reason: string;
  type: string;
  date: string;
  expired: boolean;
};

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

async function fetchWarnsFromLyg(steamId: string): Promise<{ total: number; warns: LygWarnRaw[] } | null | "rate_limited"> {
  try {
    const res = await fetch(`${LYG_BASE_URL}/warns/${steamId}?limit=10&page=1`, {
      headers: { Authorization: `Bearer ${LYG_TOKEN}`, Accept: "application/json" },
      signal: AbortSignal.timeout(7_000),
    } as RequestInit);

    if (res.status === 429) return "rate_limited";
    if (!res.ok) return null;

    const json = await res.json().catch(() => null);
    if (!json) return null;

    return {
      total: json.total ?? 0,
      warns: (json.data ?? []) as LygWarnRaw[],
    };
  } catch {
    return null;
  }
}

export async function pollLygWarns(client: Client, prisma: PrismaClient): Promise<void> {
  const logsChannelId = process.env.DISCORD_LOGS_CHANNEL_ID;
  if (!LYG_TOKEN) return;

  const DEMOTE_ROLE_ID    = "1340837563753304075";
  const BLACKLIST_ROLE_ID = "1338901141873758288";
  const RESERVIST_ROLE_ID = "1312845999366209682";

  const members = await prisma.member.findMany({
    where: {
      steamId: { not: null },
      isActive: true,
      gradeLevel: { gt: 0 },
      NOT: [
        { discordRoleIds: { has: DEMOTE_ROLE_ID    } },
        { discordRoleIds: { has: BLACKLIST_ROLE_ID } },
        { discordRoleIds: { has: RESERVIST_ROLE_ID } },
      ],
    },
    select: { id: true, steamId: true, rpName: true, discordId: true, grade: true },
  });

  const siteBase = process.env.NEXTAUTH_URL ?? "https://losesperados.fr";

  for (const member of members) {
    if (!member.steamId) continue;

    const result = await fetchWarnsFromLyg(member.steamId);

    if (result === "rate_limited") {
      console.warn("[lygWarnPoller] Rate limit LYG — arrêt du cycle");
      break;
    }
    if (!result) { await sleep(300); continue; }

    // Upsert chaque warn en DB, récupérer les nouveaux
    for (const w of result.warns) {
      let warnDate: Date;
      try { warnDate = new Date(w.date); } catch { continue; }
      if (isNaN(warnDate.getTime())) continue;

      const existing = await prisma.lygWarn.findUnique({
        where: {
          steamId_warnDate_type: {
            steamId: member.steamId,
            warnDate,
            type: w.type,
          },
        },
        select: { id: true, notified: true },
      });

      if (!existing) {
        // Warn récent = moins de 7 jours → notifier, sinon juste stocker silencieusement
        const isRecent = (Date.now() - warnDate.getTime()) < 7 * 24 * 60 * 60 * 1000;

        await prisma.lygWarn.create({
          data: {
            memberId: member.id,
            steamId: member.steamId,
            reason: w.reason,
            type: w.type,
            warnDate,
            expired: w.expired,
            notified: !isRecent, // anciens warns marqués notified=true d'emblée
          },
        });

        // Envoyer notification Discord uniquement pour les warns récents
        if (logsChannelId && isRecent) {
          try {
            const channel = await client.channels.fetch(logsChannelId).catch(() => null);
            if (channel?.isTextBased?.()) {
              const memberMention = member.discordId ? `<@${member.discordId}>` : `**${member.rpName ?? "Inconnu"}**`;
              const profileUrl = `${siteBase}/staff/members/by-discord/${member.discordId}`;
              const warnDate_str = warnDate.toLocaleString("fr-FR", { timeZone: "Europe/Paris" });

              const typeColor =
                w.type.toLowerCase().includes("ban")  ? 0xe53935 :
                w.type.toLowerCase().includes("kick") ? 0xfb8c00 :
                0xf59e0b;

              const totalWarns = await prisma.lygWarn.count({
                where: { memberId: member.id },
              });

              const embed = new EmbedBuilder()
                .setColor(typeColor)
                .setTitle(`⚠️ Nouveau warn in-game — ${w.type}`)
                .setDescription(`${memberMention} · \`${member.rpName ?? "?"}\` · ${member.grade ?? "—"}`)
                .addFields(
                  { name: "Raison",      value: w.reason,         inline: false },
                  { name: "Type",        value: w.type,           inline: true  },
                  { name: "Date",        value: warnDate_str,     inline: true  },
                  { name: "Total warns", value: `${totalWarns}`,  inline: true  },
                )
                .setTimestamp();

              if (member.discordId) {
                embed.addFields({ name: "Fiche", value: `[Voir le profil](${profileUrl})`, inline: false });
              }

              await (channel as TextChannel).send({ embeds: [embed] });

              // Marquer comme notifié
              await prisma.lygWarn.updateMany({
                where: { memberId: member.id, steamId: member.steamId, warnDate, type: w.type },
                data: { notified: true },
              });

              console.log(`[lygWarnPoller] Notifié → ${member.rpName} — ${w.type}: ${w.reason}`);
            }
          } catch (err) {
            console.error("[lygWarnPoller] Erreur envoi notif:", err);
          }
        }
      } else if (existing.id) {
        // Warn existant : mettre à jour le statut expired si nécessaire
        await prisma.lygWarn.update({
          where: { id: existing.id },
          data: { expired: w.expired },
        }).catch(() => {});
      }
    }

    await sleep(300);
  }

  console.log(`[lygWarnPoller] Cycle terminé — ${members.length} membres traités`);
}
