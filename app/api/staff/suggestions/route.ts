import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRecruiterOrAbove } from "@/lib/guards";
import { isCurrentSessionEncadrantOrAbove } from "@/lib/rbac";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";

/**
 * GET /api/staff/suggestions — liste staff des suggestions de la famille
 * (site + Discord), triées par votes ↓ puis récence. Lecture : Recruteur+.
 * Les actions (statut / note / suppression) passent par
 * /api/staff/suggestions/[id] (Encadrant+). `canManage` dit au client s'il
 * doit afficher les contrôles.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const guard = await requireRecruiterOrAbove();
  if (guard instanceof Response) return guard;

  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  const rows = await prisma.suggestion.findMany({
    where: { familyId: familyDbId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      staffNote: true,
      createdAt: true,
      author: { select: { rpName: true } },
      _count: { select: { votes: true } },
      comments: {
        select: { id: true, authorName: true, message: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const data = rows
    .map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description,
      status: s.status,
      staffNote: s.staffNote,
      authorName: s.author?.rpName ?? "?",
      votes: s._count.votes,
      createdAt: s.createdAt,
      comments: s.comments.map((c) => ({
        id: c.id,
        authorName: c.authorName,
        message: c.message,
        createdAt: c.createdAt,
      })),
    }))
    .sort((a, b) => b.votes - a.votes || +new Date(b.createdAt) - +new Date(a.createdAt));

  const canManage = await isCurrentSessionEncadrantOrAbove();
  return NextResponse.json({ ok: true, data, canManage });
}
