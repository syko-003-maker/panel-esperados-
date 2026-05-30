import { NextRequest, NextResponse } from "next/server";
import { requireFullWriter } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { triggerDiscordRenameAsync } from "@/lib/discord/rename";

/**
 * PATCH /api/staff/members/[memberId]/update-rpname
 *
 * Met à jour le rpName d'un membre. Action d'écriture → réservée aux
 * Chef / Sous-Chef / État-Major (requireFullWriter).
 *
 * ⚠️ SÉCURITÉ : avant, le guard reposait sur le flag legacy `session.isStaff`,
 * incohérent avec le RBAC basé sur les rôles Discord. Remplacé par le guard
 * canonique requireFullWriter (comme les autres mutations sensibles).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  try {
    const guard = await requireFullWriter();
    if (guard instanceof Response) return guard;
    const session: any = (guard as any).session ?? {};

    // Récupérer body
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
      { staffId: session?.user?.id ?? null }
    );

    // Déclencher le renommage Discord en arrière-plan (fire-and-forget)
    if (updated.discordId) {
      triggerDiscordRenameAsync(updated.discordId, trimmedRpName);
    }

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
