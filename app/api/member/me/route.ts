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

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }

    const member = result.member;

    return NextResponse.json({
      discordId: member.discordId,
      discordTag: result.session?.user?.name || null,
      discordAvatar: result.session?.user?.image || null,
      rpName: member.rpName,
      steamId: member.steamId,
      steamName: null,
      linkedAt: member.createdAt.toISOString(),
      verified: true,
      status: member.isActive ? ("ACTIVE" as const) : ("INACTIVE" as const),
    });
  } catch (error) {
    console.error("[api/member/me] unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
