import { getSession } from "@/auth";
import { getCurrentMember, getCurrentMemberOrThrowish as getCurrentMemberOrThrowishNew } from "@/lib/auth/current-member";

/**
 * @deprecated Use getCurrentMember() from @/lib/auth/current-member instead
 * Kept for backward compatibility
 */
export async function getDiscordIdFromSessionOrAccount(
  session: Awaited<ReturnType<typeof getSession>>
): Promise<string | null> {
  const { getDiscordIdForSession } = await import("@/lib/auth/discord-id");
  return getDiscordIdForSession(session);
}

type CurrentMemberOk = {
  ok: true;
  familyId: string;
  discordId: string;
  member: {
    id: string;
    familyId: string;
    steamId: string | null;
    discordId: string | null;
    rpName: string | null;
    age: number | null;
  };
  session: Awaited<ReturnType<typeof getSession>>;
};

type CurrentMemberError = {
  ok: false;
  status: number;
  error: string;
  familyId?: string;
  discordId?: string;
};

/**
 * @deprecated Use getCurrentMember() or getCurrentMemberOrThrowish() from @/lib/auth/current-member instead
 * Kept for backward compatibility
 */
export async function getCurrentMemberOrThrowish(): Promise<CurrentMemberOk | CurrentMemberError> {
  const session = await getSession();
  return getCurrentMemberOrThrowishNew(session) as Promise<CurrentMemberOk | CurrentMemberError>;
}
