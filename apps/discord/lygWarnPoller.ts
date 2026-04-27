/**
 * LYG Warn Poller
 * Vérifie les nouveaux warns in-game toutes les 5 minutes.
 * Envoie un embed dans DISCORD_LOGS_CHANNEL_ID quand un nouveau warn est détecté.
 */

import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { prisma } from "@/lib/db";

const LYG_BASE_URL = process.env.LYG_BASE_URL ?? "https://api.lyg.fr/api";
const LYG_TOKEN = process.env.LYG_TOKEN ?? "";

// In-memory state: steamId -> { total, lastWarnDate }
const warnState = new Map<string, { total: number; lastWarnDate: string | null }>();
let initialized = false;

async function fetchWarns(steamId: string): Promise<{ total: number; lastWarnDate: string | null } | null> {
  try {
    const url = `${LYG_BASE_URL}/warns/${steamId}?limit=1&page=1`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${LYG_TOKEN}`, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    if (!json) return null;
    const total: number = json.total ?? 0;
    const lastWarnDate: string | null = json.data?.[0]?.date ?? null;
    return { total, lastWarnDate };
  } catch {
    return null;
  }
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function pollLygWarns(client: Client): Promise<void> {
  const logsChannelId = process.env.DISCORD_LOGS_CHANNEL_ID;
  if (!logsChannelId || !LYG_TOKEN) return;

  // Récupère tous les membres actifs avec un steamId
  const members = await prisma.member.findMany({
    where: { steamId: { not: null }, isActive: true },
    select: { id: true, steamId: true, rpName: true, discordId: true, grade: true },
  });

  for (const member of members) {
    if (!member.steamId) continue;

    const current = await fetchWarns(member.steamId);
    if (!current) {
      await sleep(300);
      continue;
    }

    const prev = warnState.get(member.steamId);

    if (!initialized || !prev) {
      // Premier passage : on mémorise sans envoyer de notif
      warnState.set(member.steamId, current);
      await sleep(300);
      continue;
    }

    // Nouveau warn détecté
    if (
      current.total > prev.total ||
      (current.lastWarnDate && current.lastWarnDate !== prev.lastWarnDate && current.total >= prev.total)
    ) {
      warnState.set(member.steamId, current);

      // Récupère le détail du nouveau warn (1er de la liste = le plus récent)
      try {
        const detailUrl = `${LYG_BASE_URL}/warns/${member.steamId}?limit=1&page=1`;
        const detailRes = await fetch(detailUrl, {
          headers: { Authorization: `Bearer ${LYG_TOKEN}`, Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
          cache: "no-store",
        });
        const detail = detailRes.ok ? await detailRes.json().catch(() => null) : null;
        const newWarn = detail?.data?.[0];

        const channel = await client.channels.fetch(logsChannelId).catch(() => null);
        if (!channel?.isTextBased?.()) {
          await sleep(300);
          continue;
        }

        const warnType: string = newWarn?.type ?? "Warn";
        const reason: string = newWarn?.reason ?? "Raison inconnue";
        const warnDate = newWarn?.date ? new Date(newWarn.date).toLocaleString("fr-FR", { timeZone: "Europe/Paris" }) : "Inconnue";
        const memberMention = member.discordId ? `<@${member.discordId}>` : `**${member.rpName ?? "Inconnu"}**`;
        const profileUrl = `${process.env.SITE_BASE_URL ?? process.env.NEXTAUTH_URL ?? "https://losesperados.fr"}/staff/members/by-discord/${member.discordId}`;

        const typeColor: number =
          warnType.toLowerCase().includes("ban") ? 0xe53935 :
          warnType.toLowerCase().includes("kick") ? 0xfb8c00 :
          0xf59e0b;

        const embed = new EmbedBuilder()
          .setColor(typeColor)
          .setTitle(`⚠️ Nouveau warn in-game — ${warnType}`)
          .setDescription(`${memberMention} · \`${member.rpName ?? "?"}\` · ${member.grade ?? "—"}`)
          .addFields(
            { name: "Raison", value: reason, inline: false },
            { name: "Type", value: warnType, inline: true },
            { name: "Date", value: warnDate, inline: true },
            { name: "Total warns", value: `${current.total}`, inline: true },
          )
          .setTimestamp();

        if (member.discordId) {
          embed.addFields({ name: "Fiche", value: `[Voir le profil](${profileUrl})`, inline: false });
        }

        await (channel as TextChannel).send({ embeds: [embed] });
      } catch (err) {
        console.error("[lygWarnPoller] Failed to send warn notification:", err);
      }
    } else {
      warnState.set(member.steamId, current);
    }

    await sleep(300);
  }

  initialized = true;
}
