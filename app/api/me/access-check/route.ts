import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";
import { getMemberScopeOrNull } from "@/server/member/scope";

export const dynamic = "force-dynamic";

/**
 * GET /api/me/access-check
 * Diagnostic endpoint — returns detailed access status for the current user.
 * Helps debug "why can't I access the member space?" issues.
 */
export async function GET() {
  const steps: Record<string, unknown> = {};

  // Step 1: Session
  const session = await auth();
  if (!session) {
    return NextResponse.json({
      ok: false,
      access: false,
      reason: "NO_SESSION",
      message: "Vous n'êtes pas connecté. Connectez-vous avec Discord.",
      steps: { session: false },
    });
  }

  const userId = (session as any)?.user?.id ?? (session as any)?.userId;
  const sessionDiscordId = (session as any)?.discordId ?? (session as any)?.user?.discordId;

  steps.session = { userId, discordIdInSession: !!sessionDiscordId };

  // Step 2: Discord OAuth account
  let discordId = sessionDiscordId;
  if (!discordId && userId) {
    const account = await prisma.account.findFirst({
      where: { userId, provider: "discord" },
      select: { providerAccountId: true },
    });
    discordId = account?.providerAccountId ?? null;
    steps.accountFallback = { found: !!account };
  }

  if (!discordId) {
    return NextResponse.json({
      ok: true,
      access: false,
      reason: "NO_DISCORD_ID",
      message: "Aucun compte Discord lié à cette session. Reconnectez-vous avec Discord.",
      steps,
    });
  }

  steps.discordId = discordId;

  // Step 3: Family resolution
  let familyId: string;
  try {
    familyId = await resolveFamilyId(DEFAULT_FAMILY_ID);
    steps.familyResolution = { ok: true, familyId };
  } catch (err: any) {
    steps.familyResolution = { ok: false, error: err.message };
    return NextResponse.json({
      ok: true,
      access: false,
      reason: "FAMILY_RESOLUTION_FAILED",
      message: "Impossible de résoudre la famille. Contactez un administrateur.",
      steps,
    });
  }

  // Step 4: Member lookup
  const member = await prisma.member.findFirst({
    where: {
      discordId,
      familyId,
    },
    select: {
      id: true,
      rpName: true,
      grade: true,
      gradeLevel: true,
      isActive: true,
      discordInGuild: true,
      steamId: true,
      discordRoleIds: true,
    },
  });

  if (!member) {
    steps.member = { found: false };
    return NextResponse.json({
      ok: true,
      access: false,
      reason: "MEMBER_NOT_FOUND",
      message: `Aucun membre trouvé pour le discordId ${discordId}. Votre compte Discord n'est pas associé à un membre de la famille.`,
      steps,
    });
  }

  steps.member = {
    found: true,
    rpName: member.rpName,
    grade: member.grade,
    isActive: member.isActive,
    discordInGuild: member.discordInGuild,
    hasSteamId: !!member.steamId,
    roleCount: (member.discordRoleIds as string[] | null)?.length ?? 0,
  };

  // Step 5: Scope check (same as layout)
  const scope = await getMemberScopeOrNull(session);
  steps.scope = { resolved: !!scope, rpName: scope?.rpName ?? null };

  if (!scope) {
    return NextResponse.json({
      ok: true,
      access: false,
      reason: "SCOPE_FAILED",
      message: "Le membre existe mais le scope n'a pas pu être résolu. Contactez un administrateur.",
      steps,
    });
  }

  return NextResponse.json({
    ok: true,
    access: true,
    reason: "OK",
    message: `Accès membre OK pour ${member.rpName ?? discordId}.`,
    steps,
  });
}
