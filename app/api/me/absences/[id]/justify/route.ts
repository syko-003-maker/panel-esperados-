import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { getMemberScopeOrNull } from "@/server/member/scope";
import { enqueueJustificationEvent } from "@/lib/discord/discord";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";
import { sendPushToStaff } from "@/lib/push";

const FAMILY_ID = DEFAULT_FAMILY_ID;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const scope = await getMemberScopeOrNull(session);
  if (!scope) {
    return NextResponse.json(
      { ok: false, code: "MEMBER_NOT_LINKED" },
      { status: 403 }
    );
  }

  const { discordId } = scope;

  const familyDbId = await resolveFamilyId(FAMILY_ID);

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const message = String(body.message ?? "").trim();
  if (!message) {
    return NextResponse.json({ ok: false, error: "MISSING_MESSAGE" }, { status: 400 });
  }
  if (message.length <= 10) {
    return NextResponse.json({ ok: false, error: "MESSAGE_TOO_SHORT" }, { status: 400 });
  }

  const absence = await prisma.absence.findFirst({
    where: { id, familyId: familyDbId, discordId: String(discordId) },
  });
  if (!absence) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const justification = await prisma.$transaction(async (tx) => {
    const created = await tx.absenceJustification.create({
      data: {
        familyId: familyDbId,
        absenceId: absence.id,
        authorDiscordId: String(discordId),
        message,
      },
    });

    try {
      await enqueueJustificationEvent({
        familyId: familyDbId,
        discordId: String(discordId),
        memberId: scope.memberId,
        justificationId: created.id,
        entityId: absence.id,
        type: "absence",
        client: tx,
      });
    } catch (err) {
      console.warn("discord enqueue absence justification failed", err);
    }

    return created;
  });

  // Notifie le staff qu'une justification attend une décision (fire-and-forget).
  void sendPushToStaff({
    title: "📝 Justification d'absence",
    body: `${scope.rpName || "Un membre"} a justifié son absence.`,
    url: "/staff/absences",
    tag: "justif-absence-" + justification.id,
  }).catch((err: unknown) => {
    // Notification perdue : degradation silencieuse d'un canal d'alerte.
    console.warn("[push] notification non delivree", {
      event: "absence_justified",
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return NextResponse.json({ ok: true, justification });
}
