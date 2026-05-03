import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";

const WORKER_SECRET = process.env.DISCORD_WORKER_SECRET ?? process.env.INGEST_SECRET;

/**
 * GET /api/discord/activity?discordId=...
 * Endpoint for member to check their own activity status
 * Can be called by worker for /activity command
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
      select: { id: true, rpName: true, grade: true, isActive: true },
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
        meetingsTotal: true,
        meetingsAttended: true,
        meetingsMissed: true,
        justifiedAbsences: true,
        periodStart: true,
        periodEnd: true,
        computedAt: true,
        flags: true,
      },
    });

    // Get pending absences
    const pendingAbsences = await prisma.absence.count({
      where: { familyId, discordId, status: "PENDING" },
    });

    // Build panel URL
    const panelBaseUrl = process.env.NEXTAUTH_URL ?? process.env.PANEL_BASE_URL ?? "";
    const justifyUrl = panelBaseUrl ? `${panelBaseUrl}/me/absences` : null;

    return NextResponse.json({
      ok: true,
      activity: {
        member: {
          rpName: member.rpName,
          grade: member.grade,
          isActive: member.isActive,
        },
        snapshot: snapshot
          ? {
              status: snapshot.status,
              playtimeMinutes: snapshot.playtimeMinutes,
              meetings: {
                total: snapshot.meetingsTotal,
                attended: snapshot.meetingsAttended,
                missed: snapshot.meetingsMissed,
              },
              justifiedAbsences: snapshot.justifiedAbsences,
              period: {
                start: snapshot.periodStart,
                end: snapshot.periodEnd,
              },
              computedAt: snapshot.computedAt,
            }
          : null,
        pendingAbsences,
        links: {
          justify: justifyUrl,
        },
      },
    });
  } catch (error: any) {
    console.error("[/api/discord/activity GET]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to fetch activity" },
      { status: 500 }
    );
  }
}
