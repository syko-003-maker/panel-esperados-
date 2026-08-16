import { Client, EmbedBuilder } from "discord.js";
import { getPublicPanelUrl } from "./urls.js";
import { nonceOptions } from "./outbox-nonce.js";

/**
 * Envoie un DM Discord « doublure » à un membre (filet de sécurité des push).
 * Non bloquant : renvoie false si les DM sont fermés / l'utilisateur introuvable
 * — le push reste le canal principal, on ne fait jamais échouer l'appelant.
 * Partagé entre le handler Outbox (MEMBER_DM) et les pollers du worker.
 */
export async function sendMemberDm(
  client: Client,
  discordId: string,
  payload: { title: string; body: string; url?: string },
  // Optionnel : id du job outbox. Fourni => l'envoi devient idempotent
  // (Discord dedupe sur le nonce). Absent => comportement strictement inchange.
  jobId?: string | null
): Promise<boolean> {
  const siteBase = getPublicPanelUrl();
  const url = payload.url
    ? payload.url.startsWith("http")
      ? payload.url
      : siteBase + payload.url
    : siteBase;

  const embed = new EmbedBuilder()
    .setColor(0x9b2335)
    .setTitle(payload.title)
    .setDescription(payload.body || "​")
    .addFields({ name: "​", value: `▸ [Ouvrir le panel →](${url})` })
    .setFooter({ text: "Los Esperados • Notification" })
    .setTimestamp();

  try {
    const user = await client.users.fetch(discordId);
    await user.send({ embeds: [embed], ...nonceOptions(jobId) });
    return true;
  } catch {
    return false;
  }
}
