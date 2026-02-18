/**
 * ✅ MEGA PATCH: Current Member Source of Truth
 * 
 * Ce module fournit LA source unique pour récupérer le member lié.
 * Utilise getDiscordIdForSession() pour garantir le bon discordId.
 */

import { prisma } from "@/lib/db";
import { getDiscordIdForSession } from "./discord-id";
import { logger } from "@/lib/logger";

type Session = {
  user?: {
    id?: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  discordId?: string | null;
} | null;

export type CurrentMemberResult = {
  linked: boolean;
  discordId: string | null;
  member: {
    id: string;
    familyId: string;
    discordId: string | null;
    steamId: string | null;
    rpName: string | null;
    age: number | null;
    grade: string | null;
    gradeLevel: number;
    isActive: boolean;
  } | null;
};

/**
 * Récupère le member lié pour la session courante
 * 
 * @param session - Session NextAuth
 * @returns { linked, discordId, member }
 * 
 * Logique:
 * 1. Récupère discordId via getDiscordIdForSession()
 * 2. Si pas de discordId -> { linked: false, discordId: null, member: null }
 * 3. Query Member avec familyId_discordId unique constraint
 * 4. Retourne { linked: !!member, discordId, member }
 */
export async function getCurrentMember(session: Session): Promise<CurrentMemberResult> {
  // ✅ Étape 1: récupérer le vrai discordId
  const discordId = await getDiscordIdForSession(session);

  if (!discordId) {
    logger.warn("getCurrentMember", "no discordId found");
    return {
      linked: false,
      discordId: null,
      member: null,
    };
  }

  // ✅ Étape 2: query Member par familyId_discordId
  const familyId = "esperados";

  const member = await prisma.member.findUnique({
    where: {
      familyId_discordId: {
        familyId,
        discordId,
      },
    },
    select: {
      id: true,
      familyId: true,
      discordId: true,
      steamId: true,
      rpName: true,
      age: true,
      grade: true,
      gradeLevel: true,
      isActive: true,
    },
  });

  if (member) {
    logger.debug("getCurrentMember", `member found: ${member.id}, rpName: ${member.rpName}`);
  } else {
    logger.debug("getCurrentMember", `member not found for discordId: ${discordId}`);
  }

  return {
    linked: !!member,
    discordId,
    member: member ?? null,
  };
}

/**
 * Version "throwish" pour compatibilité avec code existant
 * Retourne { ok: true, ... } ou { ok: false, status, error }
 */
export async function getCurrentMemberOrThrowish(session: Session) {
  const result = await getCurrentMember(session);

  if (!result.linked || !result.member) {
    return {
      ok: false as const,
      status: result.discordId ? 403 : 401,
      error: result.discordId 
        ? "Compte non lié. Va dans Liaison."
        : "Unauthorized",
      discordId: result.discordId,
    };
  }

  return {
    ok: true as const,
    familyId: result.member.familyId,
    discordId: result.discordId!,
    member: result.member,
    session,
  };
}
