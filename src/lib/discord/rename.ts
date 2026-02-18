/**
 * ✅ MEGA PATCH #2: Discord Bot Auto-Rename Helper
 * 
 * Fonction pour déclencher le renommage Discord d'un membre.
 * Appelle l'endpoint worker interne pour mettre à jour le nickname.
 */

import { logger } from "@/lib/logger";

export type RenameResult = {
  success: boolean;
  reason?: string; // "success", "no_rename_needed", "permission_denied", "member_not_found", "error"
};

/**
 * Déclenche une requête interne au worker pour renommer le member Discord
 * 
 * @param discordId - Discord ID du membre
 * @param rpName - Nouveau nom RP (nickname)
 * @returns { success: boolean, reason: string }
 */
export async function triggerDiscordRename(
  discordId: string,
  rpName: string | null
): Promise<RenameResult> {
  try {
    if (!discordId || !rpName) {
      logger.warn("triggerDiscordRename", "missing discordId or rpName", { discordId, rpName });
      return { success: false, reason: "no_rename_needed" };
    }

    // ✅ Appeler endpoint interne worker
    const workerUrl = process.env.WORKER_INTERNAL_URL;
    if (!workerUrl) {
      logger.warn("triggerDiscordRename", "WORKER_INTERNAL_URL not configured");
      return { success: false, reason: "worker_not_configured" };
    }

    const response = await fetch(`${workerUrl}/internal/rename`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": process.env.WORKER_INTERNAL_SECRET || "",
      },
      body: JSON.stringify({
        discordId,
        newNickname: rpName,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      logger.warn("triggerDiscordRename", `worker returned ${response.status}`, data);
      return { success: false, reason: data.reason ?? "worker_error" };
    }

    const result = await response.json();
    logger.immediate(
      "triggerDiscordRename",
      `✅ renamed ${discordId} to "${rpName}"`,
      { reason: result.reason }
    );

    return { success: true, reason: "success" };
  } catch (error) {
    logger.error("triggerDiscordRename", "error", error);
    return { success: false, reason: "error" };
  }
}

/**
 * Déclenche le renommage sans attendre (fire-and-forget)
 * Utile lors de link accept ou recrutement
 */
export function triggerDiscordRenameAsync(discordId: string, rpName: string | null): void {
  // Fire and forget
  triggerDiscordRename(discordId, rpName).catch((err) => {
    logger.error("triggerDiscordRenameAsync", "uncaught error", err);
  });
}
