import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChefOrEtatMajor, requireEncadrantOrAbove } from "@/lib/guards";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireEncadrantOrAbove();
  if (guard instanceof Response) return guard;

  const { id } = await params;
  // familyId côté Member = ID DB (cuid) → résoudre le slug avant comparaison.
  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);

  try {
    const body = await req.json();
    const { discordId, steamId, playtimeRequiredMinutes } = body;

    // Verify member exists and belongs to family
    const current = await prisma.member.findUnique({
      where: { id },
    });

    if (!current || current.familyId !== familyDbId) {
      return NextResponse.json(
        { ok: false, error: "Member not found" },
        { status: 404 }
      );
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    // Validate and normalize discordId if provided
    if (discordId !== undefined) {
      const trimmed = String(discordId ?? "").trim();
      
      if (trimmed === "") {
        updateData.discordId = null;
      } else if (!/^\d{15,25}$/.test(trimmed)) {
        return NextResponse.json(
          { ok: false, error: "Invalid discordId format (must be 15-25 digits)" },
          { status: 400 }
        );
      } else {
        updateData.discordId = trimmed;
      }
    }

    // Validate and normalize steamId if provided
    if (steamId !== undefined) {
      const trimmed = String(steamId ?? "").trim();
      updateData.steamId = trimmed === "" ? null : trimmed;
    }

    // Exception de playtime requis (réunion) : vide/null → retire l'exception
    // (seuil par défaut 300), sinon un entier de minutes > 0.
    if (playtimeRequiredMinutes !== undefined) {
      const raw = String(playtimeRequiredMinutes ?? "").trim();
      if (raw === "") {
        updateData.playtimeRequiredMinutes = null;
      } else {
        const n = Number(raw);
        if (!Number.isInteger(n) || n <= 0 || n > 100000) {
          return NextResponse.json(
            { ok: false, error: "Playtime requis invalide (entier de minutes > 0)" },
            { status: 400 }
          );
        }
        updateData.playtimeRequiredMinutes = n;
      }
    }

    // Update member
    const member = await prisma.member.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ ok: true, member });
  } catch (err) {
    console.error("[PATCH /api/staff/members/:id] Error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
