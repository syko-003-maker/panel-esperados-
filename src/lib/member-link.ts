/**
 * Member Linking Utility
 * ✅ Single source of truth for checking if a session user is linked to a Member
 *
 * Key principles:
 * 1. Always check via discordId -> Member lookup
 * 2. Never check by userId or steamId
 * 3. Return null if not linked (safe)
 * 4. Return member data if linked
 *
 * Used in:
 * - auth.ts redirect callback
 * - login page
 * - guards
 * - API endpoints
 */

import { prisma } from "@/lib/db";
import { FAMILY_SLUG, resolveFamilyId } from "@/lib/family";

const FALLBACK_FAMILY_ID = FAMILY_SLUG;

/**
 * Get linked member for a session by Discord ID
 * This is the ONLY way to check member linking
 *
 * @param session - NextAuth session
 * @returns Member object { id, discordId, rpName, steamId, isActive } or null
 *
 * Steps:
 * 1. Extract discordId from session OR from Database.Account via userId
 * 2. Query Member by (familyId, discordId) - this is the compound unique index
 * 3. Return member data or null
 */
export async function getLinkedMemberBySession(
  session: any
): Promise<{
  id: string;
  discordId: string;
  rpName: string | null;
  steamId: string | null;
  isActive: boolean | null;
} | null> {
  if (!session?.user?.id) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[memberLink] No session.user.id, returning null");
    }
    return null;
  }

  // 1️⃣ Get Discord ID from session.discordId (set in session callback)
  // or fallback to Database.Account.providerAccountId
  let discordId = (session as any).discordId;

  if (!discordId) {
    // Fallback: Query Account to get discordId
    const account = await prisma.account.findFirst({
      where: {
        userId: session.user.id,
        provider: "discord",
      },
      select: {
        providerAccountId: true,
      },
    });

    discordId = account?.providerAccountId || null;
  }

  if (!discordId) {
    if (process.env.NODE_ENV !== "production") {
      console.log("[memberLink] No discordId found for userId", { userId: session.user.id });
    }
    return null;
  }

  let resolvedFamilyId: string = FALLBACK_FAMILY_ID;
  let familyResolveFailed = false;
  try {
    resolvedFamilyId = await resolveFamilyId(FAMILY_SLUG);
  } catch {
    familyResolveFailed = true;
    resolvedFamilyId = FALLBACK_FAMILY_ID;
  }

  // 2️⃣ Query Member by (familyId, discordId) compound unique index
  if (process.env.NODE_ENV !== "production") {
    console.log("[memberLink] Looking up member", { familyId: resolvedFamilyId, discordId, familyResolveFailed });
  }

  let member = await prisma.member.findFirst({
    where: {
      discordId,
      familyId: {
        in: Array.from(new Set([resolvedFamilyId, FALLBACK_FAMILY_ID])),
      },
    },
    select: {
      id: true,
      discordId: true,
      rpName: true,
      steamId: true,
      isActive: true,
    },
  });

  // Fallback: if family resolution failed and member not found with slug,
  // try querying by discordId alone (safe for single-family setups)
  if (!member && familyResolveFailed) {
    console.warn("[memberLink] family resolve failed, retrying by discordId only", { discordId });
    member = await prisma.member.findFirst({
      where: { discordId },
      select: {
        id: true,
        discordId: true,
        rpName: true,
        steamId: true,
        isActive: true,
      },
    });
  }

  // 3️⃣ Log result
  if (process.env.NODE_ENV !== "production") {
    console.log("[memberLink] Query result", {
      discordId,
      found: !!member,
      rpName: member?.rpName || "(none)",
      steamId: member?.steamId || "(none)",
      isActive: member?.isActive,
    });
  }

  if (!member) {
    console.warn("[memberLink] not linked", {
      userId: session.user.id,
      discordId,
      familyIdsTried: Array.from(new Set([resolvedFamilyId, FALLBACK_FAMILY_ID])),
    });
  }

  // Cast member to ensure discordId is string (we know it exists because we queried by it)
  if (member && member.discordId) {
    return {
      id: member.id,
      discordId: member.discordId as string,
      rpName: member.rpName,
      steamId: member.steamId,
      isActive: member.isActive,
    };
  }

  return null;
}

/**
 * Check if a session user is linked
 * Lightweight wrapper that returns boolean
 */
export async function isLinkedMember(session: any): Promise<boolean> {
  const member = await getLinkedMemberBySession(session);
  return !!member;
}

/**
 * Require linked member (throw if not linked)
 */
export async function requireLinkedMemberBySession(session: any) {
  const member = await getLinkedMemberBySession(session);
  if (!member) {
    throw new Error("MEMBER_NOT_LINKED");
  }
  return member;
}
