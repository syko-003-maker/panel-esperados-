import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { auditStaffAction, createAuditLog } from "@/lib/audit";
import { evaluateSanctionRules } from "@/lib/sanction-rules";
import { DEFAULT_FAMILY_ID } from "@/lib/family";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const actorId = (guard.session as any)?.user?.id ?? (guard.session as any)?.userId;
  const actorName = (guard.session as any)?.user?.name ?? null;
  if (!actorId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ ok: false, error: "MISSING_ID" }, { status: 400 });
  }

  try {
    const sanction = await prisma.sanction.findUnique({
      where: { id },
      include: { member: { select: { discordId: true, rpName: true } } },
    }) as any;

    if (!sanction) {
      return NextResponse.json({ ok: false, error: "SANCTION_NOT_FOUND" }, { status: 404 });
    }

    // Only AVERT_* types can be manually cleared
    const AVERT_TYPES = [
      "AVERT_ORAL_PLAYTIME",
      "AVERT_ORAL_REUNION",
      "AVERT_LEGER",
      "AVERT_LOURD",
    ];
    if (!AVERT_TYPES.includes(sanction.type)) {
      return NextResponse.json(
        { ok: false, error: "ONLY_AVERT_CAN_CLEAR" },
        { status: 400 }
      );
    }

    // Cannot clear if already cleared
    if (sanction.clearedAt) {
      return NextResponse.json(
        { ok: false, error: "ALREADY_CLEARED" },
        { status: 400 }
      );
    }

    const now = new Date();

    // Update sanction
    await prisma.sanction.update({
      where: { id: sanction.id },
      data: {
        clearedAt: now,
        clearedStatus: "APPLIED",
        clearedError: null,
      } as any,
    });

    // Audit trail
    const memberName = sanction.member?.rpName ?? "Unknown";
    await auditStaffAction(actorId, actorName, "SANCTION_CLEARED_MANUAL", "Sanction", sanction.id, {
      entityName: memberName,
      meta: {
        memberId: sanction.memberId,
        type: sanction.type,
      },
    });

    await createAuditLog({
      actorType: "staff",
      actorId,
      action: "SANCTION_CLEARED_MANUAL",
      entity: "Sanction",
      entityId: sanction.id,
      meta: {
        actorName,
        type: sanction.type,
        memberDiscordId: sanction.member?.discordId,
      },
    });

    // Evaluate auto sanction rules
    await evaluateSanctionRules(sanction.memberId, DEFAULT_FAMILY_ID).catch((err) => {
      console.error("[POST /api/staff/sanctions/[id]/clear] Error evaluating rules:", err);
    });

    return NextResponse.json({
      ok: true,
      sanction: {
        id: sanction.id,
        clearedAt: now.toISOString(),
        clearedStatus: "APPLIED",
      },
    });
  } catch (e: any) {
    const errMsg = e?.message ?? String(e);
    console.error("[/api/staff/sanctions/[id]/clear POST] error:", errMsg);
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
