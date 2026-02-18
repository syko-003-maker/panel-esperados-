import { NextResponse } from "next/server";
import { getSession } from "@/auth";
import { getCurrentMember } from "@/lib/auth/current-member";

// Force dynamic rendering - no caching for linked state
export const dynamic = "force-dynamic";

/**
 * ✅ GET /api/me
 * 
 * Route standardisée pour récupérer l'état du compte lié.
 * Contrat stable utilisé par toutes les pages /me et /staff/me.
 * 
 * Response:
 * {
 *   ok: true,
 *   linked: boolean,
 *   discordId: string | null,
 *   member: { id, discordId, rpName, steamId, ... } | null
 * }
 */
export async function GET() {
  try {
    const session = await getSession();

    if (!session?.user?.id) {
      return NextResponse.json(
        {
          ok: false,
          error: "Unauthorized",
        },
        { status: 401 }
      );
    }

    const result = await getCurrentMember(session);

    // Diagnostic logging (no secrets)
    console.log("[api/me] Result", {
      userId: session.user.id,
      discordId: result.discordId,
      linked: result.linked,
      memberId: result.member?.id,
      rpName: result.member?.rpName,
      timestamp: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        ok: true,
        linked: result.linked,
        discordId: result.discordId,
        member: result.member,
      },
      {
        headers: {
          "Cache-Control": "no-store, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("[api/me] error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
