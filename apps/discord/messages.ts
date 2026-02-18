/**
 * Discord message handler (thread anti-flood)
 */

import { Message } from "discord.js";
import { canSendThreadMessage } from "./antiSpam";
import { isBlacklisted, addToBlacklist, recordViolation } from "./blacklist";

type Env = {
  guildId: string;
  ticketsChannelId: string;
  logsChannelId: string;
  siteBaseUrl: string;
  staffRoleId?: string;
};

const spamWarnings = new Map<string, number>();

export async function handleMessage(message: Message, env: Env): Promise<void> {
  try {
    // Ignore bots
    if (message.author.bot) return;

    // Ignore DMs
    if (!message.guild) return;

    // Only check in threads
    if (!message.channel.isThread()) return;

    const userId = message.author.id;
    const threadId = message.channel.id;

    // Check blacklist
    const blacklistCheck = isBlacklisted(userId);
    if (blacklistCheck.blocked) {
      await message.delete().catch(() => null);
      return;
    }

    // Skip staff if configured
    if (env.staffRoleId && message.member?.roles.cache.has(env.staffRoleId)) {
      return;
    }

    // Check flood
    const cooldown = canSendThreadMessage(threadId, userId);
    if (!cooldown.ok) {
      await message.delete().catch(() => null);

      // Increment warning counter
      const warnings = (spamWarnings.get(userId) || 0) + 1;
      spamWarnings.set(userId, warnings);

      if (warnings >= 3) {
        // Auto-blacklist after 3 warnings
        addToBlacklist(userId, 30, "Spam répété dans les threads");
        recordViolation(userId, "spam");
        spamWarnings.delete(userId);

        const warnMsg = await message.channel.send(
          `🚫 <@${userId}> a été temporairement bloqué pour spam (30min).`
        ).catch(() => null);

        // Auto-delete warning after 10s
        if (warnMsg) {
          setTimeout(() => warnMsg.delete().catch(() => null), 10000);
        }
      } else {
        const warnMsg = await message.channel.send(
          `⚠️ <@${userId}> Merci d'éviter le spam. (${warnings}/3 avertissements)`
        ).catch(() => null);

        // Auto-delete warning after 5s
        if (warnMsg) {
          setTimeout(() => warnMsg.delete().catch(() => null), 5000);
        }
      }
    }
  } catch (error) {
    console.error("[messages] Error:", error);
  }
}

// Cleanup warnings every hour
setInterval(() => {
  spamWarnings.clear();
}, 60 * 60 * 1000);
