import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/auth";
import { getCurrentMember } from "@/lib/auth/current-member";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * ✅ MEGA PATCH #2: PATCH /api/staff/members/[memberId]/update-rpname
 * 
 * Route staff-only pour mettre à jour le rpName d'un membre.
 * Sécurisé: auth staff obligatoire, validation, logs.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  try {
    // ✅ Étape 1: Vérifier auth staff
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const isStaff = (session as any).isStaff || (session?.user as any).isStaff;
    if (!isStaff) {
      logger.warn("staff:update-rpname", `non-staff attempt for session ${session.user.id}`);
      return NextResponse.json(
        { ok: false, error: "Forbidden: staff only" },
        { status: 403 }
      );
    }

    // ✅ Étape 2: Récupérer body
    const body = await req.json().catch(() => ({}));
    const rpName = body?.rpName;

    // ✅ Validation rpName
    if (!rpName || typeof rpName !== "string") {
      return NextResponse.json(
        { ok: false, error: "rpName is required (string)" },
        { status: 400 }
      );
    }

    const trimmedRpName = rpName.trim();
    if (trimmedRpName.length === 0 || trimmedRpName.length > 50) {
      return NextResponse.json(
        { ok: false, error: "rpName must be 1-50 characters" },
        { status: 400 }
      );
    }

    // ✅ Récupérer le member
    const { memberId } = await params;
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, discordId: true, rpName: true, familyId: true },
    });

    if (!member) {
      return NextResponse.json({ ok: false, error: "Member not found" }, { status: 404 });
    }

    // ✅ Mettre à jour rpName
    const updated = await prisma.member.update({
      where: { id: memberId },
      data: { rpName: trimmedRpName },
      select: { id: true, rpName: true, discordId: true },
    });

    // ✅ Log et retour
    logger.immediate(
      "staff:update-rpname",
      `updated member ${memberId} rpName: "${member.rpName}" -> "${trimmedRpName}"`,
      { staffId: session.user.id }
    );

    // ✅ TODO: Trigger Discord bot rename si nécessaire
    // (implémenter plus tard avec endpoint bot internal)

    return NextResponse.json({
      ok: true,
      member: updated,
    });
  } catch (error) {
    logger.error("staff:update-rpname", "error", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
