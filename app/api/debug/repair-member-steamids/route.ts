import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logInfo, logWarn } from "@/lib/obs";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { toFamilyCuid } from "@/lib/family";

/**
 * Diagnostic et réparation des Member.steamId manquants
 * 
 * GET /api/debug/repair-member-steamids?mode=check
 * - mode=check: Diagnostic seulement (défaut)
 * - mode=repair: Applique les réparations
 * 
 * Logique:
 * 1. Trouve tous les steamIds uniques dans BankLog
 * 2. Pour chaque steamId, vérifie si Member existe avec ce steamId
 * 3. Si non, cherche dans LinkRequest ACCEPTED pour trouver le discordId
 * 4. Si trouvé, update Member avec steamId
 */
export async function GET(req: NextRequest) {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const { searchParams } = req.nextUrl;
  const mode = searchParams.get("mode") || "check";
  const familyId = await toFamilyCuid("esperados");

  logInfo("repair_member_steamids_start", { mode, familyId });

  // 1. Trouver la famille en DB
  const family = await prisma.family.findUnique({
    where: { slug: familyId },
    select: { id: true },
  });

  if (!family) {
    return NextResponse.json(
      { ok: false, error: "FAMILY_NOT_FOUND" },
      { status: 404 }
    );
  }

  const familyDbId = family.id;

  // 2. Extraire tous les steamIds uniques des BankLog (30 derniers jours)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  
  const bankLogSteamIds = await prisma.bankLog.findMany({
    where: {
      familyId: familyDbId,
      at: { gte: thirtyDaysAgo },
    },
    select: { steamId: true },
    distinct: ["steamId"],
  });

  const uniqueSteamIds = Array.from(
    new Set(bankLogSteamIds.map((b) => b.steamId?.trim()).filter(Boolean))
  );

  logInfo("repair_member_steamids_banklogs", {
    uniqueSteamIds: uniqueSteamIds.length,
  });

  // 3. Pour chaque steamId, vérifier si Member existe
  const issues: Array<{
    steamId: string;
    issue: string;
    memberExists: boolean;
    hasMemberBySteamId: boolean;
    linkRequestsFound: number;
    acceptedLinkRequest: any;
    canRepair: boolean;
    repairAction?: string;
  }> = [];

  const repairs: Array<{
    steamId: string;
    discordId: string;
    rpName: string | null;
    action: string;
  }> = [];

  for (const steamId of uniqueSteamIds) {
    // Chercher Member par steamId
    const memberBySteamId = await prisma.member.findUnique({
      where: { familyId_steamId: { familyId: familyDbId, steamId } },
      select: { id: true, discordId: true, rpName: true, steamId: true },
    });

    if (memberBySteamId) {
      // steamId déjà mappé, tout va bien
      continue;
    }

    // Pas de Member avec ce steamId, chercher dans LinkRequest
    const linkRequests = await prisma.linkRequest.findMany({
      where: {
        familyId: familyId,
        steamId: steamId,
      },
      select: {
        id: true,
        steamId: true,
        requesterDiscordId: true,
        requesterName: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const acceptedLinkRequest = linkRequests.find((lr) => lr.status === "ACCEPTED");

    if (!acceptedLinkRequest) {
      issues.push({
        steamId,
        issue: "NO_ACCEPTED_LINK_REQUEST",
        memberExists: false,
        hasMemberBySteamId: false,
        linkRequestsFound: linkRequests.length,
        acceptedLinkRequest: null,
        canRepair: false,
      });
      continue;
    }

    // On a un LinkRequest ACCEPTED, chercher le Member par discordId
    const memberByDiscordId = await prisma.member.findUnique({
      where: {
        familyId_discordId: {
          familyId: familyDbId,
          discordId: acceptedLinkRequest.requesterDiscordId,
        },
      },
      select: { id: true, discordId: true, rpName: true, steamId: true },
    });

    if (!memberByDiscordId) {
      issues.push({
        steamId,
        issue: "NO_MEMBER_BY_DISCORD",
        memberExists: false,
        hasMemberBySteamId: false,
        linkRequestsFound: linkRequests.length,
        acceptedLinkRequest: {
          discordId: acceptedLinkRequest.requesterDiscordId,
          requesterName: acceptedLinkRequest.requesterName,
          status: acceptedLinkRequest.status,
        },
        canRepair: false,
        repairAction: "Need to create Member first",
      });
      continue;
    }

    if (memberByDiscordId.steamId && memberByDiscordId.steamId !== steamId) {
      issues.push({
        steamId,
        issue: "MEMBER_HAS_DIFFERENT_STEAMID",
        memberExists: true,
        hasMemberBySteamId: false,
        linkRequestsFound: linkRequests.length,
        acceptedLinkRequest: {
          discordId: acceptedLinkRequest.requesterDiscordId,
          requesterName: acceptedLinkRequest.requesterName,
          status: acceptedLinkRequest.status,
        },
        canRepair: false,
        repairAction: `Member already has steamId: ${memberByDiscordId.steamId}`,
      });
      continue;
    }

    // Member existe par discordId mais sans steamId (ou avec le même steamId)
    issues.push({
      steamId,
      issue: memberByDiscordId.steamId ? "MEMBER_STEAMID_OK" : "MEMBER_MISSING_STEAMID",
      memberExists: true,
      hasMemberBySteamId: false,
      linkRequestsFound: linkRequests.length,
      acceptedLinkRequest: {
        discordId: acceptedLinkRequest.requesterDiscordId,
        requesterName: acceptedLinkRequest.requesterName,
        status: acceptedLinkRequest.status,
      },
      canRepair: !memberByDiscordId.steamId,
      repairAction: memberByDiscordId.steamId
        ? "Already correct"
        : `Update Member ${memberByDiscordId.id} with steamId`,
    });

    // En mode repair, appliquer la correction
    if (mode === "repair" && !memberByDiscordId.steamId) {
      await prisma.member.update({
        where: { id: memberByDiscordId.id },
        data: { steamId },
      });

      repairs.push({
        steamId,
        discordId: acceptedLinkRequest.requesterDiscordId,
        rpName: memberByDiscordId.rpName,
        action: "UPDATED",
      });

      logInfo("repair_member_steamid_updated", {
        memberId: memberByDiscordId.id,
        discordId: acceptedLinkRequest.requesterDiscordId,
        steamId,
        rpName: memberByDiscordId.rpName,
      });
    }
  }

  const summary = {
    mode,
    totalSteamIds: uniqueSteamIds.length,
    issuesFound: issues.length,
    canRepair: issues.filter((i) => i.canRepair).length,
    repaired: repairs.length,
  };

  logInfo("repair_member_steamids_done", summary);

  return NextResponse.json({
    ok: true,
    summary,
    issues: issues.slice(0, 50), // Limit to avoid huge response
    repairs,
    hint:
      mode === "check"
        ? "Use ?mode=repair to apply fixes"
        : "Repairs applied successfully",
  });
}
