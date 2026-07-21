import { NextResponse } from "next/server";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";
import { getUserDiscordIdFromSession } from "@/server/auth/discord";
import { auditStaffAction } from "@/lib/audit";
import { changeMemberGrade } from "@/lib/staff/change-grade";

/**
 * POST /api/staff/members/set-grade
 * Change le grade d'un membre (promotion OU rétrogradation) vers un grade cible.
 * Accès : Chef famille + État-Major. La logique (Member + GradeHistory + outbox
 * swap de rôle Discord) est dans `@/lib/staff/change-grade`.
 */
export async function POST(req: Request) {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const session = (guard as any).session;
  const actorId = session?.user?.id ?? session?.userId ?? null;
  const actorName = session?.user?.name ?? null;
  const actorDiscordId = await getUserDiscordIdFromSession(session).catch(() => null);

  const body = await req.json().catch(() => null);
  const memberId = body?.memberId ? String(body.memberId).trim() : null;
  const targetRoleId = body?.targetRoleId ? String(body.targetRoleId).trim() : null;
  if (!memberId || !targetRoleId) {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    const familyId = await resolveFamilyId(DEFAULT_FAMILY_ID);
    const result = await changeMemberGrade({
      familyId,
      memberId,
      targetRoleId,
      actor: { discordId: actorDiscordId, userId: actorId },
      reason: typeof body?.reason === "string" ? body.reason : "",
    });

    if (!result.ok) {
      const status = result.error === "MEMBER_NOT_FOUND" ? 404 : 400;
      return NextResponse.json(result, { status });
    }

    await auditStaffAction(actorId, actorName, "MEMBER_SET_GRADE", "Member", result.member.id, {
      familyId,
      entityName: result.member.rpName,
      meta: {
        memberDiscordId: result.member.discordId,
        oldGrade: result.oldGrade,
        newGrade: result.newGrade,
        direction: result.direction,
      },
    }).catch(() => {});

    return NextResponse.json(result);
  } catch (err) {
    console.error("[/api/staff/members/set-grade POST] error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
