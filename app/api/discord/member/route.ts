import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";
import { getPublicPanelUrl } from "@/lib/urls";

const WORKER_SECRET = process.env.DISCORD_WORKER_SECRET ?? process.env.INGEST_SECRET;

/**
 * GET /api/discord/member?discordId=...
 * Worker-only endpoint to lookup member info
 */
export async function GET(req: NextRequest) {
  // Validate worker secret — accept either Authorization: Bearer or x-ingest-secret
  const authHeader = req.headers.get("authorization");
  const ingestHeader = req.headers.get("x-ingest-secret");
  const providedSecret = ingestHeader ?? authHeader?.replace("Bearer ", "");

  if (!WORKER_SECRET || providedSecret !== WORKER_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const discordId = req.nextUrl.searchParams.get("discordId");
  const familySlug = req.nextUrl.searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;

  if (!discordId) {
    return NextResponse.json({ ok: false, error: "discordId required" }, { status: 400 });
  }

  try {
    const familyId = await resolveFamilyId(familySlug);

    // Get member
    const member = await prisma.member.findFirst({
      where: { familyId, discordId },
      select: {
        id: true,
        discordId: true,
        steamId: true,
        rpName: true,
        grade: true,
        gradeLevel: true,
        roleDiscordId: true,
        isActive: true,
        joinedAt: true,
        createdAt: true,
      },
    });

    if (!member) {
      return NextResponse.json({ ok: false, error: "Member not found" }, { status: 404 });
    }

    // Get latest activity snapshot
    const snapshot = await prisma.activitySnapshot.findFirst({
      where: { familyId, memberDiscordId: discordId },
      orderBy: { periodEnd: "desc" },
      select: {
        status: true,
        playtimeMinutes: true,
        meetingsMissed: true,
        justifiedAbsences: true,
        periodStart: true,
        periodEnd: true,
        computedAt: true,
      },
    });

    // Get active sanctions count
    const activeSanctionsCount = await prisma.sanction.count({
      where: { familyId, discordId, status: "ACTIVE" },
    });

    // Build panel URL
    const panelBaseUrl = getPublicPanelUrl();
    const panelMemberUrl = panelBaseUrl ? `${panelBaseUrl}/staff/members/by-discord/${discordId}` : null;
    const panelSanctionsUrl = panelBaseUrl ? `${panelBaseUrl}/staff/sanctions?discordId=${discordId}` : null;
    const panelActivityUrl = panelBaseUrl ? `${panelBaseUrl}/staff/activity?member=${discordId}` : null;

    return NextResponse.json({
      ok: true,
      member: {
        ...member,
        activity: snapshot
          ? {
              status: snapshot.status,
              playtimeMinutes: snapshot.playtimeMinutes,
              meetingsMissed: snapshot.meetingsMissed,
              justifiedAbsences: snapshot.justifiedAbsences,
              period: {
                start: snapshot.periodStart,
                end: snapshot.periodEnd,
              },
              computedAt: snapshot.computedAt,
            }
          : null,
        activeSanctionsCount,
        links: {
          member: panelMemberUrl,
          sanctions: panelSanctionsUrl,
          activity: panelActivityUrl,
        },
      },
    });
  } catch (error: any) {
    console.error("[/api/discord/member GET]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to fetch member" },
      { status: 500 }
    );
  }
}
