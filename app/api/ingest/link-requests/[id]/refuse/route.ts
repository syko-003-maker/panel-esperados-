import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const INGEST_SECRET = process.env.INGEST_SECRET || "";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { clickerId, clickerName, reason } = body;

    console.log("[link-request:refuse]", {
      id,
      clickerId,
      clickerName,
      reason,
      timestamp: new Date().toISOString(),
    });

    // Get LinkRequest
    const linkRequest = await prisma.linkRequest.findUnique({
      where: { id },
    });

    if (!linkRequest) {
      return NextResponse.json(
        { ok: false, error: "LinkRequest not found" },
        { status: 404 }
      );
    }

    // Check if already handled
    if (linkRequest.status !== "PENDING" && linkRequest.status !== "OPENED") {
      console.log("[link-request:refuse] Already handled", {
        id,
        status: linkRequest.status,
      });
      return NextResponse.json({
        ok: true,
        alreadyHandled: true,
        status: linkRequest.status,
      });
    }

    // Update LinkRequest to REFUSED
    const updatedRequest = await prisma.linkRequest.update({
      where: { id },
      data: {
        status: "REFUSED",
        actionByDiscordId: clickerId,
        actionByName: clickerName,
        notes: reason || null,
        lastActionAt: new Date(),
      },
    });

    console.log("[link-request:refuse] Success", {
      id,
      status: updatedRequest.status,
    });

    return NextResponse.json({
      ok: true,
      status: updatedRequest.status,
      alreadyHandled: false,
    });
  } catch (error) {
    console.error("[link-request:refuse] Error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Internal error",
      },
      { status: 500 }
    );
  }
}
