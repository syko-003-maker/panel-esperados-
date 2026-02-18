import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

/**
 * ✅ POST /api/internal/link-requests/update
 * Endpoint INTERNE pour le bot Discord mettre à jour une demande
 * 
 * Protégé par x-ingest-secret (même que pour les autres webhooks)
 * Appelé par le bot discord.js lorsqu'un staff clique un bouton
 * 
 * Pas d'accès direct DB depuis le bot -> tout passe par l'API
 */

const INGEST_SECRET = process.env.INGEST_SECRET || process.env.DISCORD_WEBHOOK_SECRET;

export async function POST(request: Request) {
  try {
    // ✅ Vérifier le secret (sécurité)
    const authHeader = request.headers.get("x-ingest-secret");
    if (!authHeader || authHeader !== INGEST_SECRET) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { requestId, action, handledByDiscordId, handledByUsername } = body;

    if (!requestId || !action || !["open", "refuse", "archive"].includes(action)) {
      return NextResponse.json(
        { ok: false, error: "Invalid request" },
        { status: 400 }
      );
    }

    // Récupérer la demande
    const linkRequest = await prisma.linkRequest.findUnique({
      where: { id: requestId },
    });

    if (!linkRequest) {
      return NextResponse.json(
        { ok: false, error: "LinkRequest not found" },
        { status: 404 }
      );
    }

    // ✅ SÉCURITÉ: Si déjà traité, refuser la double modification
    if (linkRequest.status !== "PENDING") {
      return NextResponse.json(
        {
          ok: false,
          error: `Already handled (status: ${linkRequest.status})`,
        },
        { status: 409 }
      );
    }

    // Déterminer le nouveau status
    let newStatus: "OPENED" | "REFUSED" | "ARCHIVED";
    if (action === "open") {
      newStatus = "OPENED";
    } else if (action === "refuse") {
      newStatus = "REFUSED";
    } else {
      newStatus = "ARCHIVED";
    }

    // Mettre à jour la demande
    const updated = await prisma.linkRequest.update({
      where: { id: requestId },
      data: {
        status: newStatus,
        actionByDiscordId: handledByDiscordId,
        actionByName: handledByUsername,
        lastActionAt: new Date(),
      },
    });

    return NextResponse.json({
      ok: true,
      status: newStatus,
      requestId: updated.id,
    });
  } catch (error) {
    console.error("[link-request/update] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
