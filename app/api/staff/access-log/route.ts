import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaffFull } from "@/lib/guards";

export const dynamic = "force-dynamic";

/**
 * Journal des accès au panel.
 *
 * Réservé au staff : il expose qui se connecte et qui se fait refuser, ce qui
 * touche à la vie privée des membres. Il n'a rien à faire dans l'espace membre.
 */
export async function GET(req: Request) {
  const guard = await requireStaffFull();
  if (guard instanceof Response) return guard;

  const url = new URL(req.url);
  const event = url.searchParams.get("event");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 100) || 100, 300);

  // Les compteurs sont legers et toujours affiches ; la liste ne se charge que
  // si on la demande. Inutile de transporter 150 lignes pour un panneau replie.
  const countsOnly = url.searchParams.get("countsOnly") === "1";

  const rows = countsOnly ? [] : await prisma.accessLog.findMany({
    where: event && event !== "ALL" ? { event } : undefined,
    orderBy: { at: "desc" },
    take: limit,
    select: {
      id: true, at: true, event: true, reason: true,
      discordId: true, rpName: true, username: true,
    },
  });

  // Compteurs sur 7 jours : ils donnent le contexte que la liste seule ne
  // donne pas (un refus isolé n'a pas le même sens que trente).
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const grouped = await prisma.accessLog.groupBy({
    by: ["event"],
    where: { at: { gte: since } },
    _count: { id: true },
  });

  return NextResponse.json({
    ok: true,
    rows: rows.map((r) => ({ ...r, at: r.at.toISOString() })),
    counts: Object.fromEntries(grouped.map((g) => [g.event, g._count.id])),
  });
}
