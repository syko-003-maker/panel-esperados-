import { NextRequest, NextResponse } from "next/server";
import { getCurrentMemberOrThrowish } from "@/lib/me";

/**
 * GET /api/member/me
 * Retourne le profil du member lié (rpName, discordId, steamId, etc.)
 * ✅ Utilise getCurrentMemberOrThrowish pour récupérer le discordId correct
 */
export async function GET(req: NextRequest) {
  try {
    // ✅ Récupérer le member via la source unique (Account.providerAccountId)
    const result = await getCurrentMemberOrThrowish();

    // ✅ LOG DEBUG pour tracer le problème "Compte non lié"
    console.log("[api/member/me] result:", {
      ok: result.ok,
      discordId: result.ok ? result.discordId : result.discordId,
      familyId: result.ok ? result.familyId : result.familyId,
      memberId: result.ok ? result.member.id : "N/A",
      error: result.ok ? null : result.error,
    });

    if (!result.ok) {
      return NextResponse.json(
        { 
          error: result.error,
          debug: {
            discordId: result.discordId,
            familyId: result.familyId,
          }
        },
        { status: result.status }
      );
    }

    const member = result.member;

    // ✅ Retourner le profil complet
    return NextResponse.json({
      discordId: member.discordId,
      discordTag: result.session?.user?.name || null,
      discordAvatar: result.session?.user?.image || null,
      rpName: member.rpName,
      steamId: member.steamId,
      steamName: null, // TODO: récupérer depuis une autre source si disponible
      linkedAt: new Date().toISOString(), // TODO: utiliser createdAt du Member si disponible
      verified: true, // Member trouvé = vérifié
      status: "ACTIVE" as const, // TODO: ajouter un champ status dans Member si nécessaire
    });
  } catch (error) {
    console.error("[api/member/me] unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
