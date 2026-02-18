/**
 * ✅ DIAGNOSTIC: Script pour vérifier la chaîne d'authentification
 * 
 * Ce script vérifie:
 * 1. Si le Discord ID est bien stocké dans Account.providerAccountId
 * 2. Si un Member existe avec ce discordId
 * 3. Si la session callback enrichit correctement session.discordId
 * 
 * Usage: node --loader tsx diagnostic-auth.ts
 * ou depuis route API: import et appeler getAuthDiagnostic(userId)
 * 
 * NOTE: Only logs in development or when explicitly called for diagnostics
 */

import { prisma } from "@/lib/db";

const DEBUG = process.env.NODE_ENV !== "production";

export async function getAuthDiagnostic(userId: string) {
  if (DEBUG) console.log(`\nAUTH DIAGNOSTIC for userId=${userId}`);

  // 1. Vérifier User existe
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true },
  });
  if (DEBUG) console.log("  User:", user?.name || "NOT FOUND");

  // 2. Vérifier Account Discord
  const account = await prisma.account.findFirst({
    where: { userId, provider: "discord" },
    select: { 
      id: true,
      provider: true, 
      providerAccountId: true,
      type: true,
    },
  });
  if (DEBUG) console.log("  Account:", account ? `Discord#${account.providerAccountId?.slice(0, 6)}` : "NOT FOUND");

  const discordId = account?.providerAccountId || null;

  // 3. Vérifier Member avec ce discordId
  const familyId = "esperados";
  const member = await prisma.member.findUnique({
    where: { familyId_discordId: { familyId, discordId: discordId || "" } },
    select: {
      id: true,
      familyId: true,
      discordId: true,
      steamId: true,
      rpName: true,
      createdAt: true,
    },
  });
  if (DEBUG) console.log("  Member:", member ? `${member.rpName}#${member.steamId?.slice(-4)}` : "NOT FOUND");

  // 4. Vérifier toutes les LinkRequests associées
  let linkRequests = [];
  if (discordId) {
    linkRequests = await prisma.linkRequest.findMany({
      where: { requesterDiscordId: discordId },
      select: {
        id: true,
        requesterDiscordId: true,
        status: true,
        familyId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    if (DEBUG) console.log("  LinkRequests:", linkRequests.length);
  }

  // 5. Summary result
  const success = !!(user && account && discordId && member);
  if (DEBUG) {
    if (!success) {
      if (!account) console.warn("    ⚠️ No Discord Account - user needs to sign in");
      else if (!discordId) console.warn("    ⚠️ No discordId - database issue");
      else if (!member) console.warn("    ⚠️ No Member - user needs to accept LinkRequest");
    } else {
      console.log("  ✅ FULL CHAIN OK");
    }
  }

  return {
    success,
    user,
    account,
    discordId,
    member,
  };
}
