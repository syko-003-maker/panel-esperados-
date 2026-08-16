import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logInfo } from "@/lib/obs";
import { requirePrivileged } from "@/lib/guards";
import { toFamilyCuid } from "@/lib/family";

export async function GET(req: NextRequest) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const steamId = searchParams.get("steamId");

  if (!steamId) {
    return NextResponse.json(
      { ok: false, error: "Missing steamId parameter" },
      { status: 400 }
    );
  }

  logInfo("debug_steam_to_rp_request", { steamId });

  // Normaliser le steamId
  const normalizedSteamId = steamId.trim();

  // Chercher dans Member
  const member = await prisma.member.findFirst({
    where: { steamId: normalizedSteamId },
    select: {
      id: true,
      familyId: true,
      steamId: true,
      rpName: true,
      discordId: true,
      discordUsername: true,
      grade: true,
      isActive: true,
    },
  });

  // Convention CUID : le slug ne remontait aucun membre.
  const memberByFamily = await prisma.member.findFirst({
    where: {
      familyId: await toFamilyCuid("esperados"),
      steamId: normalizedSteamId,
    },
    select: {
      id: true,
      familyId: true,
      steamId: true,
      rpName: true,
      discordId: true,
      discordUsername: true,
      grade: true,
      isActive: true,
    },
  });

  // Chercher dans BankLog pour vérifier si le steamId existe
  const bankLogCount = await prisma.bankLog.count({
    where: { steamId: normalizedSteamId },
  });

  logInfo("debug_steam_to_rp_result", {
    steamId: normalizedSteamId,
    foundInMember: !!member,
    foundInMemberByFamily: !!memberByFamily,
    bankLogCount,
    hasRpName: !!member?.rpName || !!memberByFamily?.rpName,
  });

  return NextResponse.json({
    ok: true,
    steamId: normalizedSteamId,
    foundInMember: !!member,
    member: member || null,
    foundInMemberByFamily: !!memberByFamily,
    memberByFamily: memberByFamily || null,
    bankLogCount,
    debug: {
      searchedSteamId: normalizedSteamId,
      originalSteamId: steamId,
      wasTrimmed: steamId !== normalizedSteamId,
    },
  });
}
