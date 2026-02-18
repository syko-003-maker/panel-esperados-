import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

/**
 * ✅ POST /api/internal/link-requests/resolve
 * ENDPOINT INTERNE : Finaliser une demande (refuse ou archive)
 * 
 * Protégé par x-ingest-secret
 * Appelé par le bot Discord quand staff clique "❌ Refuser" ou "💤 Archiver"
 */

const INGEST_SECRET = process.env.INGEST_SECRET || process.env.DISCORD_WEBHOOK_SECRET;

// Rôles qui peuvent override (finaliser même si lockée par quelqu'un d'autre)
const OVERRIDE_ROLES = [
  "1429607761720770623", // Chef Famille
  "1312845999366209683", // État Major
];

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
    const {
      requestId,
      action,
      staffDiscordId,
      staffUsername,
      staffRoles = [],
    } = body;

    if (!requestId || !action || !staffDiscordId || !staffUsername) {
      return NextResponse.json(
        { ok: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!["refuse", "archive"].includes(action)) {
      return NextResponse.json(
        { ok: false, error: "Invalid action" },
        { status: 400 }
      );
    }

    // TRANSACTION : Résolution atomique
    const resolveResult = await prisma.$transaction(
      async (tx) => {
        // 1. Récupérer la demande
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

        // 2. Vérifier que ce n'est pas déjà traité
        if (
          linkRequest.status === "REFUSED" ||
          linkRequest.status === "ARCHIVED"
        ) {
          return {
            ok: false,
            reason: "ALREADY_TREATED",
            error: `Already treated (status: ${linkRequest.status})`,
            statusCode: 409,
            data: {
              status: linkRequest.status,
              handledByDiscordId: linkRequest.actionByDiscordId,
              handledByUsername: linkRequest.actionByName,
            },
          };
        }

        // 3. Vérification de permission
        // Si demande est OPENED et lockée par quelqu'un d'autre :
        const hasOverride = staffRoles.some((role: string) =>
          OVERRIDE_ROLES.includes(role)
        );

        if (
          linkRequest.status === "OPENED" &&
          linkRequest.lockedByDiscordId &&
          linkRequest.lockedByDiscordId !== staffDiscordId &&
          !hasOverride
        ) {
          return {
            ok: false,
            reason: "LOCKED_BY_OTHER",
            error: `Locked by ${linkRequest.lockedByUsername}. Only Chef/EtatMajor can override.`,
            statusCode: 403,
            data: {
              lockedByDiscordId: linkRequest.lockedByDiscordId,
              lockedByUsername: linkRequest.lockedByUsername,
            },
          };
        }

        // 4. ✅ Résoudre la demande
        const newStatus = action === "refuse" ? "REFUSED" : "ARCHIVED";
        const notes = action === "refuse" ? `Refusé par ${staffUsername}` : `Archivé par ${staffUsername}`;

        const updated = await tx.linkRequest.update({
          where: { id: requestId },
          data: {
            status: newStatus,
            actionByDiscordId: staffDiscordId,
            actionByName: staffUsername,
            notes,
            lastActionAt: new Date(),
          },
        });

        return {
          ok: true,
          data: {
            requestId: updated.id,
            status: updated.status,
            actionByDiscordId: updated.actionByDiscordId,
            actionByName: updated.actionByName,
            wasByOverride: hasOverride && linkRequest.lockedByDiscordId !== staffDiscordId,
          },
        };
      },
      {
        maxWait: 5000,
        timeout: 10000,
      }
    );

    if (!resolveResult.ok) {
      return NextResponse.json(
        {
          ok: false,
          reason: resolveResult.reason,
          error: resolveResult.error,
          data: resolveResult.data,
        },
        { status: resolveResult.statusCode || 500 }
      );
    }

    return NextResponse.json(resolveResult);
  } catch (error) {
    console.error("[link-request/resolve] Error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
