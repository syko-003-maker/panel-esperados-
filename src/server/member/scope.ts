/**
 * Member Scope - Source of Truth for member identity
 * ✅ Used across all member APIs and pages
 * ✅ Separates member auth from member data
 *
 * Architecture:
 * - getLinkedMemberForSession() returns basic linked member info
 * - getMemberScope() wraps it with additional helpers for member context
 */

import { getLinkedMemberForSession } from "@/server/auth/member";

/**
 * Get member scope from session
 * This is the authoritative check that member is both:
 * 1) Authenticated (NextAuth session)
 * 2) Linked to a Member in DB
 *
 * @param session - NextAuth session
 * @returns { discordId, rpName, memberId } or throws error
 */
export async function getMemberScope(session: any): Promise<{
  discordId: string;
  rpName: string | null;
  memberId: string;
  steamId: string | null;
}> {
  const linkedMember = await getLinkedMemberForSession(session);

  if (!linkedMember) {
    throw new Error("MEMBER_NOT_LINKED");
  }

  if (!linkedMember.discordId) {
    throw new Error("MEMBER_NOT_LINKED");
  }

  return {
    discordId: linkedMember.discordId,
    rpName: linkedMember.rpName,
    memberId: linkedMember.id,
    steamId: linkedMember.steamId ?? null,
  };
}

/**
 * Same as getMemberScope but returns null instead of throwing
 */
export async function getMemberScopeOrNull(session: any): Promise<{
  discordId: string;
  rpName: string | null;
  memberId: string;
  steamId: string | null;
} | null> {
  try {
    return await getMemberScope(session);
  } catch {
    return null;
  }
}
