import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID } from "@/lib/family";

// This endpoint can be called without auth for cron jobs
// Use a secret header for security
const CRON_SECRET = process.env.CRON_SECRET;

function validateCronSecret(req: Request): boolean {
  if (!CRON_SECRET) return true; // If no secret configured, allow (dev mode)
  const secret = req.headers.get("x-cron-secret");
  return secret === CRON_SECRET;
}

/**
 * POST /api/admin/expire-sanctions
 * Auto-expire sanctions that have passed their endAt date
 * Called by cron job
 */
export async function POST(req: NextRequest) {
  // Validate cron secret
  if (!validateCronSecret(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const familyId = req.nextUrl.searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;
  const now = new Date();

  try {
    // Find all active sanctions with expired endAt
    const expiredSanctions = await prisma.sanction.findMany({
      where: {
        familyId,
        status: "ACTIVE",
        endAt: { lt: now },
      },
      select: {
        id: true,
        discordId: true,
        type: true,
        endAt: true,
      },
    });

    if (expiredSanctions.length === 0) {
      return NextResponse.json({
        ok: true,
        expired: 0,
        message: "No expired sanctions found",
      });
    }

    // Update all expired sanctions
    const result = await prisma.sanction.updateMany({
      where: {
        id: { in: expiredSanctions.map((s) => s.id) },
      },
      data: {
        status: "EXPIRED",
        closedAt: now,
      },
    });

    // Log the expirations
    console.log(JSON.stringify({
      event: "sanctions_expired",
      count: result.count,
      sanctions: expiredSanctions.map((s) => ({
        id: s.id,
        discordId: s.discordId,
        type: s.type,
        endAt: s.endAt,
      })),
      timestamp: now.toISOString(),
    }));

    return NextResponse.json({
      ok: true,
      expired: result.count,
      sanctions: expiredSanctions.map((s) => ({
        id: s.id,
        discordId: s.discordId,
        type: s.type,
      })),
    });
  } catch (error: any) {
    console.error("[/api/admin/expire-sanctions]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Expire sanctions failed" },
      { status: 500 }
    );
  }
}

/**
 * GET - for health check / status
 */
export async function GET(req: NextRequest) {
  const familyId = req.nextUrl.searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;

  try {
    const counts = await prisma.sanction.groupBy({
      by: ["status"],
      where: { familyId },
      _count: true,
    });

    const pendingExpiration = await prisma.sanction.count({
      where: {
        familyId,
        status: "ACTIVE",
        endAt: { lt: new Date() },
      },
    });

    return NextResponse.json({
      ok: true,
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
      pendingExpiration,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}
