import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { DEFAULT_FAMILY_ID } from "@/lib/family";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const { id } = await params;
  const familyId = req.nextUrl.searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;

  try {
    const body = await req.json();
    const { discordId, steamId } = body;

    // Verify member exists and belongs to family
    const current = await prisma.member.findUnique({
      where: { id },
    });

    if (!current || current.familyId !== familyId) {
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
