import { getSession } from "@/auth";
import { prisma } from "@/lib/db";

/**
 * ✅ PATCH: Source de vérité UNIQUE pour récupérer discordId
 * 1) Essaie session.user.discordId
 * 2) Fallback: query prisma.account si absent
 * 3) Retourne string|null
 */
export async function getDiscordIdFromSessionOrAccount(
  session: Awaited<ReturnType<typeof getSession>>
): Promise<string | null> {
  const userId = session?.user?.id || (session as any)?.userId;
  if (!userId) return null;

  // 1) Essayer depuis session (déjà chargé par callback)
  const fromSession = (session.user as any)?.discordId || (session as any)?.discordId;
  if (fromSession && typeof fromSession === "string") {
    return fromSession;
  }

  // 2) Fallback: query Account (rare, au cas où session pas encore refresh)
  const account = await prisma.account.findFirst({
    where: { userId, provider: "discord" },
    select: { providerAccountId: true },
  });
  return account?.providerAccountId ?? null;
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
 * ✅ PATCH: getCurrentMemberOrThrowish refactorisé
 * - Utilise getDiscordIdFromSessionOrAccount (source unique)
 * - findUnique avec familyId_discordId (contrainte existante)
 * - Logs DEBUG clairs
 */
export async function getCurrentMemberOrThrowish(): Promise<CurrentMemberOk | CurrentMemberError> {
  const session = await getSession();
  const userId = session?.user?.id || null;

  if (!session?.user || !userId) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  // ✅ Source unique
  const discordId = await getDiscordIdFromSessionOrAccount(session);
  
  // ✅ LOG DEBUG
  console.log("[auth] session userId:", userId, "discordId:", discordId);

  if (!discordId) {
    return { ok: false, status: 403, error: "Compte non lié. Va dans Liaison." };
  }

  const familyId = "esperados";

  // ✅ Utiliser findUnique avec contrainte composite
  const member = await prisma.member.findUnique({
    where: { familyId_discordId: { familyId, discordId } },
    select: {
      id: true,
      familyId: true,
      steamId: true,
      discordId: true,
      rpName: true,
      age: true,
    },
  });

  if (!member) {
    // ✅ LOG DEBUG
    console.log("[auth] member not found for discordId:", discordId);
    return {
      ok: false,
      status: 403,
      error: "Compte non lié. Va dans Liaison.",
      familyId,
      discordId,
    };
  }

  if (!member.steamId) {
    // ✅ LOG DEBUG
    console.log("[auth] member found but no steamId:", member.id);
    return {
      ok: false,
      status: 403,
      error: "Compte non lié. Va dans Liaison.",
      familyId,
      discordId,
    };
  }

  // ✅ LOG DEBUG
  console.log("[auth] member found id:", member.id, "discordId:", member.discordId, "steamId:", member.steamId);

  return {
    ok: true,
    familyId,
    discordId,
    member,
    session,
  };
}
