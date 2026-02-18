import { EmbedBuilder, type User } from "discord.js";

type LinkPanelEmbedArgs = {
  user: User;
  discordId?: string | null;
  steamId?: string | null;
  rpName?: string | null;
  sourceLabel?: string;
  now?: Date;
};

function formatDateFr(date: Date): string {
  const d = date.getDate().toString().padStart(2, "0");
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const y = date.getFullYear().toString().slice(-2);
  const hh = date.getHours().toString().padStart(2, "0");
  const mm = date.getMinutes().toString().padStart(2, "0");

  return `${d}-${m}-${y} ${hh}:${mm}`;
}

function normalizeOptional(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildLinkPanelEmbed(params: LinkPanelEmbedArgs): EmbedBuilder {
  const { user } = params;
  const discordId = params.discordId ?? user.id;
  const steamId = normalizeOptional(params.steamId);
  const rpName = normalizeOptional(params.rpName);
  const isLinked = Boolean(steamId);
  const linkedStatus = isLinked ? "Lié" : "Non lié";
  const now = params.now ?? new Date();
  const avatarUrl =
    user?.displayAvatarURL?.({ size: 256 }) ??
    "https://cdn.discordapp.com/embed/avatars/0.png";

  return new EmbedBuilder()
    .setTitle("🔗 Panneau de Liaison")
    .setDescription(`Gérer la liaison pour <@${discordId}>`)
    .setColor(0x5865f2)
    .setThumbnail(avatarUrl)
    .addFields(
      {
        name: "🔷 Discord",
        value: `<@${discordId}>\n*${linkedStatus}*`,
        inline: true,
      },
      {
        name: "🛠️ SteamID64",
        value: steamId ? `\`${steamId}\`` : "*Non défini*",
        inline: true,
      },
      {
        name: "👤 Nom RP",
        value: rpName ? rpName : "*Non défini*",
        inline: true,
      }
    )
    .setFooter({
      text: `Los Esperados | Système de liaison • ${formatDateFr(now)}`,
    })
    .setTimestamp(now);
}

export { buildLinkPanelEmbed, formatDateFr };
export type { LinkPanelEmbedArgs };
