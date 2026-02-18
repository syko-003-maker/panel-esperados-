import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const steamId = searchParams.get("steamId");

  if (!steamId) {
    return NextResponse.json(
      { ok: false, error: "Missing steamId parameter" },
      { status: 400 }
    );
  }

  const normalizedSteamId = steamId.trim();
  const hints: string[] = [];

  // 1) Chercher dans Member
  const membersFound = await prisma.member.findMany({
    where: { steamId: normalizedSteamId },
    select: {
      id: true,
      familyId: true,
      steamId: true,
      discordId: true,
      rpName: true,
      grade: true,
      isActive: true,
    },
    take: 5,
  });

  // 2) Chercher dans Member avec familyId esperados
  const membersEsperados = await prisma.member.findMany({
    where: {
      familyId: "esperados",
      steamId: normalizedSteamId,
    },
    select: {
      id: true,
      familyId: true,
      steamId: true,
      discordId: true,
      rpName: true,
      grade: true,
      isActive: true,
    },
    take: 5,
  });

  // 3) Chercher dans LinkRequest
  const linkRequests = await prisma.linkRequest.findMany({
    where: { steamId: normalizedSteamId },
    select: {
      id: true,
      familyId: true,
      steamId: true,
      requesterDiscordId: true,
      requesterName: true,
      status: true,
      createdAt: true,
    },
    take: 5,
  });

  // 4) Chercher dans BankLog
  const bankLogCount = await prisma.bankLog.count({
    where: { steamId: normalizedSteamId },
  });

  const bankLogSample = await prisma.bankLog.findMany({
    where: { steamId: normalizedSteamId },
    select: {
      id: true,
      familyId: true,
      steamId: true,
      at: true,
      type: true,
      money: true,
    },
    take: 3,
    orderBy: { at: "desc" },
  });

  // 5) Chercher dans Recruitment
  const recruitments = await prisma.recruitment.findMany({
    where: { steamId: normalizedSteamId },
    select: {
      id: true,
      steamId: true,
      discordId: true,
      rpName: true,
      status: true,
      createdAt: true,
    },
    take: 5,
  });

  // 6) Chercher dans RecruitmentTicket (candidateSteamId)
  const recruitmentTickets = await prisma.recruitmentTicket.findMany({
    where: { candidateSteamId: normalizedSteamId },
    select: {
      id: true,
      candidateSteamId: true,
      candidateDiscordId: true,
      candidateRpName: true,
      status: true,
      createdAt: true,
    },
    take: 5,
  });

  // Générer hints
  if (membersFound.length === 0) {
    hints.push("❌ Member.steamId ne contient pas ce steamId");
  } else {
    hints.push(`✅ Trouvé ${membersFound.length} membre(s) dans Member`);
    if (membersFound.some((m) => m.rpName)) {
      hints.push("✅ Au moins un membre a un rpName");
    } else {
      hints.push("⚠️ Aucun membre trouvé n'a de rpName rempli");
    }
  }

  if (membersEsperados.length > 0) {
    hints.push(`✅ Trouvé ${membersEsperados.length} membre(s) esperados`);
  }

  if (linkRequests.length > 0) {
    hints.push(`✅ Trouvé ${linkRequests.length} LinkRequest(s)`);
    const pendingCount = linkRequests.filter((lr) => lr.status === "PENDING").length;
    const acceptedCount = linkRequests.filter((lr) => lr.status === "ACCEPTED").length;
    if (pendingCount > 0) hints.push(`   → ${pendingCount} en attente`);
    if (acceptedCount > 0) hints.push(`   → ${acceptedCount} accepté(s)`);
  }

  if (bankLogCount > 0) {
    hints.push(`✅ Trouvé ${bankLogCount} BankLog(s)`);
  } else {
    hints.push("⚠️ Aucun BankLog trouvé pour ce steamId");
  }

  if (recruitments.length > 0) {
    hints.push(`✅ Trouvé ${recruitments.length} Recruitment(s)`);
  }

  if (recruitmentTickets.length > 0) {
    hints.push(`✅ Trouvé ${recruitmentTickets.length} RecruitmentTicket(s)`);
  }

  if (
    membersFound.length === 0 &&
    linkRequests.length === 0 &&
    bankLogCount === 0 &&
    recruitments.length === 0 &&
    recruitmentTickets.length === 0
  ) {
    hints.push("❌ Ce steamId n'existe dans AUCUNE table");
    hints.push("💡 Vérifiez le format du steamId (SteamID64)");
  }

  return NextResponse.json({
    ok: true,
    steamId: normalizedSteamId,
    inMember: {
      found: membersFound.length > 0,
      count: membersFound.length,
      rows: membersFound,
    },
    inMemberEsperados: {
      found: membersEsperados.length > 0,
      count: membersEsperados.length,
      rows: membersEsperados,
    },
    inLinkRequest: {
      found: linkRequests.length > 0,
      count: linkRequests.length,
      rows: linkRequests,
    },
    inBankLog: {
      found: bankLogCount > 0,
      count: bankLogCount,
      sample: bankLogSample,
    },
    inRecruitment: {
      found: recruitments.length > 0,
      count: recruitments.length,
      rows: recruitments,
    },
    inRecruitmentTicket: {
      found: recruitmentTickets.length > 0,
      count: recruitmentTickets.length,
      rows: recruitmentTickets,
    },
    hints,
  });
}
