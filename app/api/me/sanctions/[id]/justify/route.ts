import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { getMemberScopeOrNull } from "@/server/member/scope";
import { enqueueJustificationEvent } from "@/lib/discord/discord";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";

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

  const sanction = await prisma.sanction.findFirst({
    where: { id, familyId: familyDbId, discordId: String(discordId) },
  });
  if (!sanction) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  const justification = await prisma.$transaction(async (tx) => {
    const created = await tx.sanctionJustification.create({
      data: {
        familyId: familyDbId,
        sanctionId: sanction.id,
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
        entityId: sanction.id,
        type: "sanction",
        client: tx,
      });
    } catch (err) {
      console.warn("discord enqueue sanction justification failed", err);
    }

    return created;
  });

  return NextResponse.json({ ok: true, justification });
}
