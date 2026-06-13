import { NextResponse } from "next/server";
import { getSession } from "@/auth";
import { requireStaffAccess } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { resolveFamilyId } from "@/lib/family";

const DEFAULT_FAMILY_SLUG = process.env.FAMILY_ID ?? "esperados";

// GET /api/links -> retourne toutes les liaisons (members)
// ⚠️ SÉCURITÉ : expose discordId + steamId + rpName de TOUS les membres
// (cartographie d'identités). Réservé au staff.
export async function GET() {
  const guard = await requireStaffAccess();
  if (guard instanceof Response) return guard;

  try {
    const links = await prisma.member.findMany({
      where: { familyId: await resolveFamilyId(DEFAULT_FAMILY_SLUG) },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        discordId: true,
        steamId: true,
        rpName: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(links, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    console.error("GET /api/links error:", error);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

// POST /api/links — DÉSACTIVÉ.
// Ce chemin permettait à tout utilisateur connecté de lier sa session à la
// fiche d'un AUTRE membre via un steamId arbitraire dans le body (et
// débranchait le discordId du propriétaire légitime). Le flux officiel passe
// par les demandes de liaison (link-requests) côté staff.
export async function POST() {
  return NextResponse.json({ ok: false, error: "ENDPOINT_DISABLED" }, { status: 410 });
}
