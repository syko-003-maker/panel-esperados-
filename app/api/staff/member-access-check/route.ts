import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaffAccess } from "@/lib/rbac";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";
import { getDiscordGrade } from "@/lib/discord-grade";

export const dynamic = "force-dynamic";

/**
 * GET /api/staff/member-access-check?discordId=XXX
 * Staff-only diagnostic: check if a specific member can access the member space.
 * ⚠️ SÉCURITÉ : renvoie de la PII membre (rpName, grade…) — réservé au staff
 * (avant : un simple `session` suffisait → n'importe quel membre connecté).
 */
export async function GET(req: NextRequest) {
  const guard = await requireStaffAccess();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const discordId = searchParams.get("discordId");

  if (!discordId) {
    return NextResponse.json({ ok: false, error: "Missing discordId parameter" }, { status: 400 });
  }

  let familyId: string;
  try {
    familyId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  } catch {
    return NextResponse.json({ ok: false, error: "Family resolution failed" }, { status: 500 });
  }

  // Check Member record
  const member = await prisma.member.findFirst({
    where: { discordId, familyId },
    select: {
      id: true,
      rpName: true,
      grade: true,
      gradeLevel: true,
      isActive: true,
      discordInGuild: true,
      steamId: true,
      discordRoleIds: true,
      discordUsername: true,
      discordDisplayName: true,
    },
  });

  // Check OAuth Account
  const account = await prisma.account.findFirst({
    where: { provider: "discord", providerAccountId: discordId },
    select: { userId: true },
  });

  const computedGrade = member?.discordRoleIds
    ? getDiscordGrade(member.discordRoleIds as string[])
    : null;

  return NextResponse.json({
    ok: true,
    discordId,
    member: member
      ? {
          rpName: member.rpName,
          grade: member.grade,
          computedGrade,
          isActive: member.isActive,
          discordInGuild: member.discordInGuild,
          hasSteamId: !!member.steamId,
          discordUsername: member.discordUsername,
        }
      : null,
    hasOAuthAccount: !!account,
    canAccessMemberSpace: !!(member && account),
    blockers: [
      !member && "Aucun membre trouvé pour ce discordId",
      member && !member.isActive && "Membre inactif",
      !account && "Pas de compte Discord OAuth (l'utilisateur ne s'est jamais connecté au site)",
      member && !member.steamId && "Pas de SteamID lié",
    ].filter(Boolean),
  });
}
