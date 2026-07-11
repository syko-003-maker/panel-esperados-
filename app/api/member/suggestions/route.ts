import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getMemberScopeOrNull } from "@/server/member/scope";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";
import { isCurrentSessionEncadrantOrAbove } from "@/lib/rbac";

/**
 * GET  /api/member/suggestions — liste des suggestions de la famille (triées
 *      par votes ↓ puis récence), avec nb de votes + si le membre courant a voté.
 * POST /api/member/suggestions — proposer une suggestion (auteur = membre
 *      courant). Anti-spam : 1 suggestion / 10 min / membre. Auto-vote de sa
 *      propre suggestion.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const COOLDOWN_MS = 10 * 60_000;

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const scope = await getMemberScopeOrNull(session);
  if (!scope) return NextResponse.json({ ok: false, code: "MEMBER_NOT_LINKED" }, { status: 403 });

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
      votes: { where: { memberId: scope.memberId }, select: { id: true }, take: 1 },
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
      hasVoted: s.votes.length > 0,
      createdAt: s.createdAt,
    }))
    .sort((a, b) => b.votes - a.votes || +new Date(b.createdAt) - +new Date(a.createdAt));

  const canManage = await isCurrentSessionEncadrantOrAbove();
  return NextResponse.json({ ok: true, data, canManage, me: scope.memberId ? true : false });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const scope = await getMemberScopeOrNull(session);
  if (!scope) return NextResponse.json({ ok: false, code: "MEMBER_NOT_LINKED" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const title = String(body?.title ?? "").trim();
  const description = String(body?.description ?? "").trim();
  if (title.length < 4 || title.length > 120) {
    return NextResponse.json({ ok: false, error: "Le titre doit faire entre 4 et 120 caractères." }, { status: 400 });
  }
  if (description.length < 10 || description.length > 2000) {
    return NextResponse.json({ ok: false, error: "La description doit faire entre 10 et 2000 caractères." }, { status: 400 });
  }

  // Anti-spam : 1 suggestion / 10 min / membre.
  const recent = await prisma.suggestion.findFirst({
    where: { authorId: scope.memberId, createdAt: { gt: new Date(Date.now() - COOLDOWN_MS) } },
    select: { id: true },
  });
  if (recent) {
    return NextResponse.json(
      { ok: false, error: "Tu viens déjà de proposer une suggestion — attends quelques minutes." },
      { status: 429 }
    );
  }

  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  const created = await prisma.suggestion.create({
    data: {
      familyId: familyDbId,
      authorId: scope.memberId,
      title,
      description,
      status: "OPEN",
      createdById: (session.user as any).id,
    },
    select: { id: true },
  });

  // L'auteur vote automatiquement pour sa propre suggestion.
  await prisma.suggestionVote
    .create({ data: { suggestionId: created.id, memberId: scope.memberId } })
    .catch(() => {});

  return NextResponse.json({ ok: true, id: created.id });
}
