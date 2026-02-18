/**
 * GET /api/ingest/members/by-discord/:discordId
 * 
 * Secure ingest endpoint to lookup member by Discord ID
 * Used by Discord worker for /syncname command and other operations
 *
 * Protected by INGEST_SECRET header
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const INGEST_SECRET = process.env.INGEST_SECRET || "";
const FAMILY_ID = "esperados";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ discordId: string }> }
) {
  try {
    // Verify secret
    const secret = req.headers.get("x-ingest-secret");
    if (!secret || secret !== INGEST_SECRET) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { discordId } = await params;

    if (!discordId || typeof discordId !== "string") {
      return NextResponse.json(
        { ok: false, error: "Invalid discordId" },
        { status: 400 }
      );
    }

    // Find member by Discord ID
    const member = await prisma.member.findUnique({
      where: {
        familyId_discordId: {
          familyId: FAMILY_ID,
          discordId,
        },
      },
      select: {
        id: true,
        discordId: true,
        rpName: true,
        steamId: true,
      },
    });

    if (!member) {
      return NextResponse.json(
        { ok: false, error: "Member not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      member: {
        id: member.id,
        discordId: member.discordId,
        rpName: member.rpName,
        steamId: member.steamId,
      },
    });
  } catch (error) {
    console.error("[api/ingest/members/by-discord] error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Internal error",
      },
      { status: 500 }
    );
  }
}
