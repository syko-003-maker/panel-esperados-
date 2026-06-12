import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getMemberScopeOrNull } from "@/server/member/scope";

/**
 * POST /api/member/reglement — Assistant règlement (même moteur que la
 * commande Discord /reglement). Le panel proxifie vers le worker, qui porte
 * le corpus + l'appel Gemini + les quotas (cooldown 30s et plafond quotidien
 * PARTAGÉS entre Discord et le site, par discordId).
 */

const WORKER_INTERNAL_URL = process.env.WORKER_INTERNAL_URL || "http://127.0.0.1:3001";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  // Réservé aux membres liés (comme le calculateur / les justificatifs).
  const linkedMember = await getMemberScopeOrNull(session);
  if (!linkedMember?.discordId) {
    return NextResponse.json({ ok: false, error: "MEMBER_NOT_LINKED" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const question = String((body as any)?.question ?? "").trim();
  if (question.length < 3 || question.length > 300) {
    return NextResponse.json(
      { ok: false, error: "La question doit faire entre 3 et 300 caractères." },
      { status: 400 }
    );
  }

  const secret = process.env.INGEST_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Service non configuré." }, { status: 500 });
  }

  try {
    const res = await fetch(`${WORKER_INTERNAL_URL}/internal/reglement/ask`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-ingest-secret": secret },
      body: JSON.stringify({ userId: linkedMember.discordId, question }),
      signal: AbortSignal.timeout(50_000),
    });
    const data = await res.json().catch(() => null);

    if (!data) {
      return NextResponse.json({ ok: false, error: "Réponse illisible du service IA." }, { status: 502 });
    }
    // Les erreurs "métier" (cooldown, quota, IA indisponible) arrivent en
    // ok:false avec un message FR prêt à afficher — on les relaie telles quelles.
    return NextResponse.json(data, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const isTimeout = /abort|timeout/i.test(msg);
    return NextResponse.json(
      {
        ok: false,
        error: isTimeout
          ? "L'IA met trop de temps à répondre — réessaie dans un instant."
          : "Assistant indisponible (bot hors ligne ?) — réessaie dans quelques minutes.",
      },
      { status: 200 }
    );
  }
}
