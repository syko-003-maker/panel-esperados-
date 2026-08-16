import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireEncadrantOrAbove } from "@/lib/guards";

/**
 * PATCH  /api/staff/suggestions/[id] — change le statut + note staff.
 * DELETE /api/staff/suggestions/[id] — supprime (abus / doublon).
 * Réservé Encadrant+ (inclut État-Major).
 */

export const dynamic = "force-dynamic";

const VALID_STATUS = ["OPEN", "PLANNED", "DONE", "REJECTED"] as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireEncadrantOrAbove();
  if (guard instanceof Response) return guard;

  const { id } = await params;
  const body = await req.json().catch(() => null);

  const data: { status?: (typeof VALID_STATUS)[number]; staffNote?: string | null } = {};
  if (body?.status != null) {
    if (!VALID_STATUS.includes(body.status)) {
      return NextResponse.json({ ok: false, error: "STATUT_INVALIDE" }, { status: 400 });
    }
    data.status = body.status;
  }
  if (body?.staffNote !== undefined) {
    const note = String(body.staffNote ?? "").trim().slice(0, 1000);
    data.staffNote = note.length ? note : null;
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ ok: false, error: "RIEN_A_METTRE_A_JOUR" }, { status: 400 });
  }

  // Avant : toute erreur DB devenait un 404 "NOT_FOUND" trompeur. On distingue
  // desormais "la suggestion n'existe pas" d'une panne d'ecriture.
  let updated;
  try {
    updated = await prisma.suggestion.update({ where: { id }, data, select: { id: true, status: true, staffNote: true } });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    console.error("[staff/suggestions] mise a jour echouee", { id, code });
    if (code === "P2025") {
      return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: "UPDATE_FAILED" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ...updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireEncadrantOrAbove();
  if (guard instanceof Response) return guard;

  const { id } = await params;
  try {
    await prisma.suggestion.delete({ where: { id } });
  } catch (err) {
    const code = (err as { code?: string })?.code;
    console.error("[staff/suggestions] suppression echouee", { id, code });
    if (code === "P2025") {
      return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ ok: false, error: "DELETE_FAILED" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
