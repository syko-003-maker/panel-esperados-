import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireFullWriter } from "@/lib/guards";
import { createAuditLog } from "@/lib/audit";

/**
 * PATCH /api/staff/family/members/[id]
 *
 * Met à jour l'INTENT WL d'un membre — ce que le chef veut qu'il devienne
 * sur LYG. N'affecte PAS LYG directement (l'API publique n'expose pas
 * d'endpoint d'écriture famille). Le chef applique ensuite sur
 * https://families.lyg.fr.
 *
 * Body :
 *   { wlClassIntent?: 1|2|3|4|null, wlOwnerIntent?: boolean }
 *
 * `wlClassIntent: null` = retirer le membre de la famille (plan de retrait).
 *
 * Restreint à requireFullWriter (= Chef/Sous-Chef/EM, pas Encadrant).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const guard = await requireFullWriter();
  if (guard instanceof Response) return guard;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  // Parse + validation
  const hasClass = Object.prototype.hasOwnProperty.call(body, "wlClassIntent");
  const hasOwner = Object.prototype.hasOwnProperty.call(body, "wlOwnerIntent");

  if (!hasClass && !hasOwner) {
    return NextResponse.json({ ok: false, error: "NO_FIELDS" }, { status: 400 });
  }

  let nextClass: number | null | undefined;
  if (hasClass) {
    const raw = (body as any).wlClassIntent;
    if (raw === null) {
      nextClass = null;
    } else {
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 4) {
        return NextResponse.json(
          { ok: false, error: "INVALID_WL_CLASS", message: "wlClassIntent doit être 1..4 ou null" },
          { status: 400 }
        );
      }
      nextClass = n;
    }
  }

  let nextOwner: boolean | undefined;
  if (hasOwner) {
    nextOwner = Boolean((body as any).wlOwnerIntent);
  }

  // Get current member to compute audit diff
  const existing = await prisma.member.findUnique({
    where: { id },
    select: {
      id: true,
      rpName: true,
      wlClass: true,
      wlOwner: true,
      wlClassIntent: true,
      wlOwnerIntent: true,
      familyId: true,
    },
  });
  if (!existing) {
    return NextResponse.json({ ok: false, error: "MEMBER_NOT_FOUND" }, { status: 404 });
  }

  const session: any = (guard as any).session ?? {};
  const actorDiscordId =
    session.discordId ??
    session.user?.discordId ??
    null;
  const actorName = session.user?.name ?? null;

  const data: Record<string, any> = {
    wlIntentUpdatedAt: new Date(),
    wlIntentBy: actorDiscordId,
  };
  if (hasClass) data.wlClassIntent = nextClass;
  if (hasOwner) data.wlOwnerIntent = nextOwner;

  const updated = await prisma.member.update({
    where: { id },
    data,
    select: {
      id: true,
      rpName: true,
      wlClass: true,
      wlOwner: true,
      wlClassIntent: true,
      wlOwnerIntent: true,
      wlIntentUpdatedAt: true,
      wlIntentBy: true,
    },
  });

  // Audit log : qui a modifié quoi
  await createAuditLog({
    actorType: "staff",
    actorId: actorDiscordId,
    actorName,
    action: "FAMILY_WL_INTENT_UPDATED",
    entity: "Member",
    entityId: id,
    entityName: existing.rpName ?? "Inconnu",
    meta: {
      from: {
        wlClassIntent: existing.wlClassIntent,
        wlOwnerIntent: existing.wlOwnerIntent,
      },
      to: {
        wlClassIntent: updated.wlClassIntent,
        wlOwnerIntent: updated.wlOwnerIntent,
      },
      lygCurrent: {
        wlClass: existing.wlClass,
        wlOwner: existing.wlOwner,
      },
    },
  });

  return NextResponse.json({ ok: true, row: updated });
}
