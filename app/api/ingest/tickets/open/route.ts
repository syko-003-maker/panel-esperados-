import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID } from "@/lib/family";

const INGEST_SECRET = process.env.DISCORD_INGEST_SECRET ?? process.env.INGEST_SECRET;

function validateSecret(req: Request): boolean {
  if (!INGEST_SECRET) return false;
  const secret = req.headers.get("x-ingest-secret");
  return secret === INGEST_SECRET;
}

export async function GET(req: NextRequest) {
  // Check secret is configured
  if (!INGEST_SECRET) {
    return NextResponse.json(
      { ok: false, error: "INGEST_SECRET not configured" },
      { status: 500 }
    );
  }

  // Validate secret header
  if (!validateSecret(req)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const searchParams = req.nextUrl.searchParams;
  const type = searchParams.get("type");
  const discordId = searchParams.get("discordId");

  if (!type || !["recruitment", "complaint"].includes(type)) {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid type (recruitment|complaint)" },
      { status: 400 }
    );
  }

  if (!discordId) {
    return NextResponse.json(
      { ok: false, error: "Missing discordId" },
      { status: 400 }
    );
  }

  try {
    let openCount = 0;

    // Support familyId from query params (multi-family ready)
    const familyId = searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;

    if (type === "recruitment") {
      // Count open recruitments for this user
      // PENDING status = open
      openCount = await prisma.recruitment.count({
        where: {
          familyId,
          discordId: discordId,
          status: "PENDING",
          closedAt: null,
        },
      });
    } else if (type === "complaint") {
      // Count open complaints for this user
      openCount = await prisma.complaint.count({
        where: {
          familyId,
          authorDiscordId: discordId,
          status: "OPEN",
          closedAt: null,
        },
      });
    }

    return NextResponse.json({ ok: true, openCount });
  } catch (err) {
    console.error("[ingest/tickets/open] Error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
