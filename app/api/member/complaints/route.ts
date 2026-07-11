import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getMemberScopeOrNull } from "@/server/member/scope";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";

/**
 * Plaintes déposées depuis le SITE (espace membre) — un membre contre un autre
 * membre de la famille. Réutilise le système Complaint existant :
 *  - crée une Complaint (statut OPEN) en liant PROPREMENT complainant + target
 *    (le flux Discord ne stocke qu'un ID) → visible dans /staff/complaints ;
 *  - enfile le MÊME job worker (SANCTION_NOTIFY / TICKET_CREATE) que le flux
 *    Discord → le staff a le thread comme d'habitude. Best-effort : la plainte
 *    existe en base même si l'outbox échoue.
 *
 * GET  → « Mes plaintes » (celles déposées par le membre courant + statut).
 * POST → déposer une plainte.
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

const TICKET_PARENT_CHANNEL = process.env.DISCORD_TICKETS_CATEGORY_ID || null;
const COMPLAINT_FAMILY_ID = "esperados"; // les Complaint existantes utilisent ce slug
const COOLDOWN_MS = 5 * 60_000;

function makeTicketKey(): string {
  return `pl_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Ouverte",
  IN_REVIEW: "En cours",
  RESOLVED: "Résolue",
  REJECTED: "Rejetée",
  CLOSED: "Clôturée",
};

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const scope = await getMemberScopeOrNull(session);
  if (!scope) return NextResponse.json({ ok: false, code: "MEMBER_NOT_LINKED" }, { status: 403 });

  const rows = await prisma.complaint.findMany({
    where: { complainantId: scope.memberId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      title: true,
      status: true,
      createdAt: true,
      target: { select: { rpName: true } },
      targetName: true,
    },
  });
  const data = rows.map((c) => ({
    id: c.id,
    title: c.title,
    status: c.status,
    statusLabel: STATUS_LABEL[c.status] ?? c.status,
    targetName: c.target?.rpName ?? c.targetName ?? "?",
    createdAt: c.createdAt,
  }));
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const scope = await getMemberScopeOrNull(session);
  if (!scope) return NextResponse.json({ ok: false, code: "MEMBER_NOT_LINKED" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const title = String(body?.title ?? "").trim();
  const description = String(body?.description ?? "").trim();
  const evidence = String(body?.evidence ?? "").trim();
  const targetId = String(body?.targetId ?? "").trim();

  if (title.length < 4 || title.length > 120)
    return NextResponse.json({ ok: false, error: "Le titre doit faire entre 4 et 120 caractères." }, { status: 400 });
  if (description.length < 10 || description.length > 2000)
    return NextResponse.json({ ok: false, error: "La description doit faire entre 10 et 2000 caractères." }, { status: 400 });
  if (!targetId)
    return NextResponse.json({ ok: false, error: "Choisis le membre concerné." }, { status: 400 });
  if (targetId === scope.memberId)
    return NextResponse.json({ ok: false, error: "Tu ne peux pas porter plainte contre toi-même." }, { status: 400 });

  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  const target = await prisma.member.findFirst({
    where: { id: targetId, familyId: familyDbId, isActive: true },
    select: { id: true, rpName: true, discordId: true },
  });
  if (!target)
    return NextResponse.json({ ok: false, error: "Membre introuvable dans la famille." }, { status: 404 });

  // Anti-spam : 1 plainte / 5 min / membre.
  const recent = await prisma.complaint.findFirst({
    where: { complainantId: scope.memberId, createdAt: { gt: new Date(Date.now() - COOLDOWN_MS) } },
    select: { id: true },
  });
  if (recent)
    return NextResponse.json(
      { ok: false, error: "Tu viens de déposer une plainte — attends quelques minutes." },
      { status: 429 }
    );

  const ticketKey = makeTicketKey();
  const complaint = await prisma.complaint.create({
    data: {
      ticketKey,
      status: "OPEN",
      title,
      description,
      evidence: evidence || null,
      familyId: COMPLAINT_FAMILY_ID,
      complainantId: scope.memberId,
      targetId: target.id,
      targetName: target.rpName,
      authorRpName: scope.rpName,
      authorDiscordId: scope.discordId,
      searchText: `${target.rpName ?? ""} ${scope.rpName ?? ""} ${title}`.toLowerCase(),
      createdById: (session.user as any).id,
    },
    select: { id: true, ticketKey: true },
  });

  // Notif staff via le même job que le flux Discord (best-effort).
  await prisma.discordOutbox
    .create({
      data: {
        familyId: COMPLAINT_FAMILY_ID,
        type: "SANCTION_NOTIFY",
        status: "PENDING",
        attempt: 0,
        maxAttempts: 10,
        channelId: TICKET_PARENT_CHANNEL,
        entityId: complaint.id,
        nextAttemptAt: new Date(),
        meta: {
          kind: "TICKET_CREATE",
          ticketKind: "COMPLAINT",
          ticketId: complaint.id,
          title,
          description,
          targetDiscordId: target.discordId ?? null,
          authorDiscordId: scope.discordId,
          ticketChannelId: TICKET_PARENT_CHANNEL,
          source: "site",
        },
      },
    })
    .catch((e) => console.error("[member/complaints] outbox échec (plainte créée quand même):", e));

  return NextResponse.json({ ok: true, id: complaint.id });
}
