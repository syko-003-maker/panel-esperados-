import { NextResponse } from "next/server";
import { lygFamilyRemove } from "@/lib/lyg/family-admin";
import { createAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";

/**
 * Endpoint interne appelé par discord-worker quand une sanction
 * DEMOTE ou BLACKLIST est appliquée. Retire le membre de la famille
 * LYG via le proxy admin cookie.
 *
 * Auth : header x-ingest-secret (même secret que les autres /api/internal/).
 *
 * Body : { steamId: "76561...", reason?: string, source?: "sanction_demote" | "sanction_blacklist", sanctionId?: string }
 *
 * Réponse :
 *   { ok: true, applied: true }       — retiré avec succès
 *   { ok: true, applied: false, reason: "..." }  — pas appliqué (cookie absent, expired, déjà non WL)
 *   { ok: false, error: "..." }       — erreur réseau / LYG down
 */
export async function POST(req: Request) {
  const secret = req.headers.get("x-ingest-secret");
  const expected = process.env.INGEST_SECRET;
  if (!expected || secret !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const steamId = String((body as any).steamId ?? "").trim();
  if (!/^\d{17}$/.test(steamId)) {
    return NextResponse.json({ ok: false, error: "INVALID_STEAMID" }, { status: 400 });
  }

  const source = String((body as any).source ?? "worker").trim() || "worker";
  const sanctionId = String((body as any).sanctionId ?? "").trim() || null;

  // Cherche le member en DB pour l'audit + vérif s'il est WL.
  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  const member = await prisma.member.findFirst({
    where: { familyId: familyDbId, steamId },
    select: { id: true, rpName: true, wlClass: true },
  });

  // Pas WL ? Rien à faire. On répond succès "no-op".
  if (member && member.wlClass === null) {
    return NextResponse.json({
      ok: true,
      applied: false,
      reason: "MEMBER_NOT_IN_FAMILY",
    });
  }

  let result;
  try {
    result = await lygFamilyRemove(steamId);
  } catch (err) {
    // Cookie pas configuré → on log et on continue. Non-fatal pour le worker.
    const msg = err instanceof Error ? err.message : String(err);
    await createAuditLog({
      actorType: "worker",
      actorId: null,
      action: "LYG_FAMILY_REMOVE_AUTO_SKIPPED",
      entity: "Member",
      entityId: member?.id ?? steamId,
      entityName: member?.rpName ?? null,
      meta: { steamId, source, sanctionId, reason: msg },
    });
    return NextResponse.json({ ok: true, applied: false, reason: msg });
  }

  if (!result.ok) {
    await createAuditLog({
      actorType: "worker",
      actorId: null,
      action: "LYG_FAMILY_REMOVE_AUTO_FAILED",
      entity: "Member",
      entityId: member?.id ?? steamId,
      entityName: member?.rpName ?? null,
      meta: {
        steamId,
        source,
        sanctionId,
        error: (result as any).error,
        expired: (result as any).expired,
        lygStatus: result.status,
      },
    });
    return NextResponse.json({
      ok: false,
      applied: false,
      error: (result as any).error,
      expired: (result as any).expired,
    });
  }

  // Succès : on met aussi à jour wlClass localement pour refléter l'état
  // sans attendre la prochaine sync LYG.
  if (member) {
    await prisma.member.update({
      where: { id: member.id },
      data: {
        wlClass: null,
        wlClassIntent: null,
        wlOwner: false,
        wlOwnerIntent: false,
        wlIntentUpdatedAt: new Date(),
        wlIntentBy: "worker:auto",
      },
    }).catch(() => {});
  }

  await createAuditLog({
    actorType: "worker",
    actorId: null,
    action: "LYG_FAMILY_REMOVE_AUTO",
    entity: "Member",
    entityId: member?.id ?? steamId,
    entityName: member?.rpName ?? null,
    meta: { steamId, source, sanctionId, tookMs: result.tookMs },
  });

  return NextResponse.json({ ok: true, applied: true, tookMs: result.tookMs });
}
