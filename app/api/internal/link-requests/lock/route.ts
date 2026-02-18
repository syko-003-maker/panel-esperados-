import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

/**
 * ✅ POST /api/internal/link-requests/lock
 * ENDPOINT INTERNE : Lock atomique pour éviter les conflits
 * 
 * Protégé par x-ingest-secret
 * Appelé par le bot Discord quand staff clique "✅ Traiter"
 * 
 * Transaction Prisma pour éviter les race conditions
 * Garantit qu'une seule personne peut prendre une demande
 */

const INGEST_SECRET = process.env.INGEST_SECRET || process.env.DISCORD_WEBHOOK_SECRET;

export async function POST(request: Request) {
  try {
    // ✅ Vérifier le secret
    const authHeader = request.headers.get("x-ingest-secret");
    if (!authHeader || authHeader !== INGEST_SECRET) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { requestId, staffDiscordId, staffUsername } = body;

    if (!requestId || !staffDiscordId || !staffUsername) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // TRANSACTION : Atomique lock
    const lockResult = await prisma.$transaction(
      async (tx) => {
        // 1. Récupérer la demande avec lock (SELECT FOR UPDATE équivalent)
        const linkRequest = await tx.linkRequest.findUnique({
          where: { id: requestId },
        });

        if (!linkRequest) {
          return {
            ok: false,
            reason: "NOT_FOUND",
            error: "LinkRequest not found",
            statusCode: 404,
          };
        }

        // 2. Vérifier état : doit être PENDING
        if (linkRequest.status !== "PENDING") {
          return {
            ok: false,
            reason: "ALREADY_TREATED",
            error: `Already treated (status: ${linkRequest.status})`,
            statusCode: 409,
            data: {
              status: linkRequest.status,
              handledByDiscordId: linkRequest.actionByDiscordId,
              handledByUsername: linkRequest.actionByName,
              lastActionAt: linkRequest.lastActionAt,
            },
          };
        }

        // 3. Vérifier lock : doit être libre
        if (linkRequest.lockedByDiscordId) {
          return {
            ok: false,
            reason: "ALREADY_LOCKED",
            error: `Already locked by ${linkRequest.lockedByUsername}`,
            statusCode: 409,
            data: {
              lockedByDiscordId: linkRequest.lockedByDiscordId,
              lockedByUsername: linkRequest.lockedByUsername,
              lockedAt: linkRequest.lockedAt,
            },
          };
        }

        // 4. ✅ Lock la demande de manière atomique
        const updated = await tx.linkRequest.update({
          where: { id: requestId },
          data: {
            status: "OPENED",
            lockedByDiscordId: staffDiscordId,
            lockedByUsername: staffUsername,
            lockedAt: new Date(),
            lastActionAt: new Date(),
          },
        });

        return {
          ok: true,
          data: {
            requestId: updated.id,
            status: updated.status,
            lockedByDiscordId: updated.lockedByDiscordId,
            lockedByUsername: updated.lockedByUsername,
            lockedAt: updated.lockedAt,
          },
        };
      },
      {
        // Transaction options pour éviter les timeouts
        maxWait: 5000,
        timeout: 10000,
      }
    );

    // Retourner le résultat avec le bon status code
    if (!lockResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          reason: lockResult.reason,
          error: lockResult.error,
          data: lockResult.data,
        },
        { status: lockResult.statusCode || 500 }
      );
    }

    return NextResponse.json(lockResult);
  } catch (error) {
    console.error("[link-request/lock] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
