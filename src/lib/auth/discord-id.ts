/**
 * ✅ MEGA PATCH: Discord ID Source of Truth
 * 
 * Ce module fournit LA source unique pour récupérer le Discord ID.
 * RÈGLE: Ne JAMAIS utiliser session.user.id comme discordId.
 * Le vrai discordId = Account.providerAccountId (provider="discord")
 */

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

type Session = {
  user?: {
    id?: string;
  };
  discordId?: string | null;
} | null;

const DISCORD_ID_REGEX = /^\d{17,20}$/;

/**
 * Récupère le Discord ID depuis la session (optimisé avec cache session)
 * 
 * @param session - Session NextAuth
 * @returns Discord ID (17-20 digits) ou null
 * 
 * Logique:
 * 1. Si session.discordId existe ET est valide -> retourne immédiatement (cache)
 * 2. Sinon query Account.providerAccountId
 * 3. Retourne null si aucun compte Discord trouvé
 */
export async function getDiscordIdForSession(session: Session): Promise<string | null> {
  if (!session?.user?.id) {
    return null;
  }

  const userId = session.user.id;

  // ✅ Cache optimisation: si session.discordId existe ET est valide
  const cachedDiscordId = (session as any).discordId;
  if (cachedDiscordId && typeof cachedDiscordId === "string" && DISCORD_ID_REGEX.test(cachedDiscordId)) {
    logger.debug("getDiscordIdForSession", `cache hit: ${cachedDiscordId}`);
    return cachedDiscordId;
  }

  // ✅ Fallback: query Account table (source of truth)
  logger.debug("getDiscordIdForSession", `cache miss, querying Account for userId: ${userId}`);
  
  const account = await prisma.account.findFirst({
    where: {
      userId,
      provider: "discord",
    },
    select: {
      providerAccountId: true,
    },
  });

  const discordId = account?.providerAccountId ?? null;
  
  if (discordId) {
    logger.debug("getDiscordIdForSession", `found from Account: ${discordId}`);
  } else {
    logger.warn("getDiscordIdForSession", `Account not found for userId: ${userId}`);
  }

  return discordId;
}
