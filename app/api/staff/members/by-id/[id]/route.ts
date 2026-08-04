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
    const { rpName, discordId, steamId, playtimeRequiredMinutes, releaseRpNameOverride } = body;

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

    // Nom RP. Le formulaire l'envoie depuis toujours, mais il n'était pas lu
    // ici : l'API répondait « ok » sans rien écrire, donc l'écran affichait
    // « Membre mis à jour » et le nom restait inchangé.
    //
    // Écrire `rpName` seul ne suffirait pas : le sync LYG le réécrit depuis le
    // jeu toutes les 45 s. On pose donc aussi `rpNameOverride`, que le sync
    // respecte — sinon le renommage disparaissait avant d'être vu.
    if (releaseRpNameOverride === true) {
      // Retour au nom du jeu : le prochain sync le restaure tout seul.
      updateData.rpNameOverride = null;
    } else if (rpName !== undefined) {
      const trimmed = String(rpName ?? "").trim();
      if (trimmed === "") {
        return NextResponse.json(
          { ok: false, error: "Le nom RP est obligatoire" },
          { status: 400 }
        );
      }
      if (trimmed.length > 100) {
        return NextResponse.json(
          { ok: false, error: "Nom RP trop long (100 caractères maximum)" },
          { status: 400 }
        );
      }
      updateData.rpName = trimmed;
      // Un membre hors LYG n'est jamais réécrit par le sync : inutile de le
      // verrouiller, ça masquerait juste un futur nom du jeu s'il en gagne un.
      if (current.source === "LYG" && trimmed !== (current.rpName ?? "")) {
        updateData.rpNameOverride = trimmed;
      }
    }

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
    // (seuil par défaut 300) ; 0 = EXEMPTÉ (aucun minimum) ; sinon entier > 0.
    if (playtimeRequiredMinutes !== undefined) {
      const raw = String(playtimeRequiredMinutes ?? "").trim();
      if (raw === "") {
        updateData.playtimeRequiredMinutes = null;
      } else {
        const n = Number(raw);
        if (!Number.isInteger(n) || n < 0 || n > 100000) {
          return NextResponse.json(
            { ok: false, error: "Playtime requis invalide (entier de minutes ≥ 0 ; 0 = exempté)" },
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
