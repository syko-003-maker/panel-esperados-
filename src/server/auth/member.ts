import { prisma } from "@/lib/db";
import { getDiscordIdForSession } from "./discord";
import { debug as logDebug } from "@/lib/logger";
import { getLinkedMemberBySession } from "@/lib/member-link";

const FAMILY_ID = "esperados";

/**
 * Get the linked member for a session
 * Returns null if user is authenticated but not linked to a Member in DB
 *
 * This is the SERVER-SIDE check for member linking.
 * Use this in:
 * - Server Components (async layout/pages)
 * - Server Actions
 * - API routes
 *
 * Process:
 * 1. Get Discord ID from OAuth Account (providerAccountId) - source of truth
 * 2. Query Member by familyId + discordId compound index
 * 3. Return member or null
 *
 * @param session - NextAuth session
 * @returns Member object or null if not linked
 */
export async function getLinkedMemberForSession(
  session: any
): Promise<{
  id: string;
  discordId: string | null;
  rpName: string | null;
  steamId: string | null;
} | null> {
  // ✅ Use single source of truth from @/lib/member-link
  const member = await getLinkedMemberBySession(session);
  
  if (!member) {
    logDebug("[member] getLinkedMemberForSession: No member found");
    return null;
  }
  
  // Return in format expected by callers (with nullable discordId)
  return {
    id: member.id,
    discordId: member.discordId,
    rpName: member.rpName,
    steamId: member.steamId,
  };
}

/**
 * Require a linked member for a session
 * Throws error if user is not linked
 *
 * @param session - NextAuth session
 * @returns Member object
 * @throws Error with message "MEMBER_NOT_LINKED" if not linked
 */
export async function requireLinkedMember(session: any): Promise<{
  id: string;
  discordId: string | null;
  rpName: string | null;
  steamId: string | null;
}> {
  const member = await getLinkedMemberForSession(session);
  if (!member) {
    throw new Error("MEMBER_NOT_LINKED");
  }
  return member;
}
