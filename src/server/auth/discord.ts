import { prisma } from "@/lib/db";
import { debug as logDebug } from "@/lib/logger";

/**
 * Get Discord ID for a session
 * Source of truth: Account.providerAccountId (provider="discord")
 * 
 * This is the ONLY reliable way to get Discord ID - directly from OAuth Account record
 */
export async function getDiscordIdForSession(
  session: any
): Promise<string | null> {
  if (!session?.user?.id) {
    logDebug("[discord] getDiscordIdForSession: No session.user.id");
    return null;
  }

  const account = await prisma.account.findFirst({
    where: {
      userId: session.user.id,
      provider: "discord",
    },
    select: {
      providerAccountId: true,
    },
  });

  const discordId = account?.providerAccountId ?? null;
  
  logDebug("[discord] getDiscordIdForSession", {
    userId: session.user.id,
    discordIdFound: !!discordId,
    discordId: discordId?.substring(0, 6) + (discordId ? "..." : ""), // Log first 6 chars only
  });

  return discordId;
}

/**
 * Resolve Discord ID from session with fallback to providerAccountId
 */
export async function getUserDiscordIdFromSession(
  session: any
): Promise<string | null> {
  const direct =
    session?.discordId ??
    session?.user?.discordId ??
    session?.account?.providerAccountId ??
    null;

  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }

  return getDiscordIdForSession(session);
}

/**
 * Parse Discord ID allowlist from ENV
 * Trims whitespace and filters empty strings
 */
export function parseDiscordIds(envValue?: string): string[] {
  return (envValue ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
