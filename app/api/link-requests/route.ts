import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/db";

const FAMILY_ID = "esperados";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { ok: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Get user's Discord account
    const account = await prisma.account.findFirst({
      where: {
        userId: (session.user as any).id,
        provider: "discord",
      },
    });

    if (!account?.providerAccountId) {
      return NextResponse.json(
        { ok: false, error: "No Discord account linked" },
        { status: 400 }
      );
    }

    const discordId = account.providerAccountId;
    const discordUsername = session.user.name || "Unknown";

    // Check if already has a pending request
    const existingRequest = await prisma.linkRequest.findFirst({
      where: {
        familyId: FAMILY_ID,
        requesterDiscordId: discordId,
        status: { in: ["PENDING", "OPENED"] },
      },
    });

    if (existingRequest) {
      return NextResponse.json({
        ok: false,
        error: "Vous avez déjà une demande en cours",
        requestId: existingRequest.id,
      });
    }

    // Create LinkRequest
    const linkRequest = await prisma.linkRequest.create({
      data: {
        familyId: FAMILY_ID,
        requesterDiscordId: discordId,
        requesterName: discordUsername,
        status: "PENDING",
      },
    });

    console.log("[link-request:create]", {
      requestId: linkRequest.id,
      discordId,
      discordUsername,
      timestamp: new Date().toISOString(),
    });

    // Call worker to post Discord message
    try {
      const workerUrl = `${process.env.INGEST_BASE_URL}/api/worker/link-request/post`;
      const workerResponse = await fetch(workerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-ingest-secret": process.env.INGEST_SECRET || "",
        },
        body: JSON.stringify({
          requestId: linkRequest.id,
          discordId,
          username: discordUsername,
        }),
      });

      if (!workerResponse.ok) {
        console.error("[link-request:create] Worker call failed", {
          status: workerResponse.status,
          requestId: linkRequest.id,
        });
      } else {
        const workerData = await workerResponse.json();
        console.log("[link-request:create] Worker called successfully", {
          requestId: linkRequest.id,
          messageId: workerData.messageId,
        });

        // Update LinkRequest with Discord message ID
        if (workerData.messageId) {
          await prisma.linkRequest.update({
            where: { id: linkRequest.id },
            data: { discordMessageId: workerData.messageId },
          });
        }
      }
    } catch (workerError) {
      console.error("[link-request:create] Worker call error", workerError);
      // Continue anyway - request is created
    }

    return NextResponse.json({
      ok: true,
      requestId: linkRequest.id,
      message: "Demande de liaison créée avec succès",
    });
  } catch (error) {
    console.error("[link-request:create] Error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Internal error",
      },
      { status: 500 }
    );
  }
}
