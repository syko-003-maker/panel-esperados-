import { NextResponse } from "next/server";
import { requireChefFamille } from "@/lib/guards";
import {
  clearLygCredential,
  getLygCredentialState,
  setLygCredential,
  testLygCookie,
} from "@/lib/lyg/family-admin";
import { createAuditLog } from "@/lib/audit";

/**
 * Endpoint de gestion du cookie PHPSESSID pour le proxy families.lyg.fr.
 *
 * Réservé au Chef famille / Sous-Chef / EM. Bien que les actions LYG soient
 * ensuite restreintes au seul propriétaire du cookie (cf. proxy), on accepte
 * ici tout staff full pour permettre la rotation à 4 mains si besoin.
 *
 * GET    : renvoie l'état (configuré ? expiré ? masqué ?). JAMAIS le cookie en clair.
 * POST   : enregistre un nouveau cookie. Body : { cookie: "...", test?: true }.
 * DELETE : supprime le cookie stocké.
 * PUT    : déclenche un test sans changer le cookie. Body vide.
 */

export async function GET() {
  const guard = await requireChefFamille();
  if (guard instanceof Response) return guard;
  const state = await getLygCredentialState();
  return NextResponse.json({ ok: true, state });
}

export async function POST(req: Request) {
  const guard = await requireChefFamille();
  if (guard instanceof Response) return guard;

  const session: any = (guard as any).session ?? {};
  const discordId =
    session.discordId ??
    session.user?.discordId ??
    null;
  if (!discordId) {
    return NextResponse.json(
      { ok: false, error: "MISSING_DISCORD_ID" },
      { status: 400 }
    );
  }
  const ownerName = session.user?.name ?? null;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }
  const cookie = String((body as any).cookie ?? "").trim();
  if (!cookie) {
    return NextResponse.json({ ok: false, error: "COOKIE_REQUIRED" }, { status: 400 });
  }

  try {
    await setLygCredential({ cookie, ownerDiscordId: discordId, ownerName });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "SET_FAILED" },
      { status: 400 }
    );
  }

  await createAuditLog({
    actorType: "staff",
    actorId: discordId,
    actorName: ownerName,
    action: "LYG_COOKIE_UPDATED",
    entity: "DiscordConfig",
    entityId: "lyg-credential",
    entityName: "LYG admin cookie",
    meta: { source: "panel/settings" },
  });

  // Test immédiat si demandé (par défaut oui — meilleure UX)
  const shouldTest = (body as any).test !== false;
  if (shouldTest) {
    const result = await testLygCookie();
    const state = await getLygCredentialState();
    return NextResponse.json({ ok: true, state, testResult: result });
  }

  const state = await getLygCredentialState();
  return NextResponse.json({ ok: true, state });
}

export async function PUT() {
  const guard = await requireChefFamille();
  if (guard instanceof Response) return guard;
  const result = await testLygCookie().catch((err) => ({
    ok: false as const,
    status: 0,
    tookMs: 0,
    error: err instanceof Error ? err.message : String(err),
    expired: false,
  }));
  const state = await getLygCredentialState();
  return NextResponse.json({ ok: true, state, testResult: result });
}

export async function DELETE() {
  const guard = await requireChefFamille();
  if (guard instanceof Response) return guard;
  const session: any = (guard as any).session ?? {};
  const discordId = session.discordId ?? session.user?.discordId ?? null;
  await clearLygCredential();
  await createAuditLog({
    actorType: "staff",
    actorId: discordId,
    action: "LYG_COOKIE_DELETED",
    entity: "DiscordConfig",
    entityId: "lyg-credential",
    entityName: "LYG admin cookie",
    meta: {},
  });
  return NextResponse.json({ ok: true });
}
