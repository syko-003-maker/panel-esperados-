/**
 * Helpers JSON pour /api/banklogs : réponse OK/erreur cohérente + auth ingest.
 *
 * Extrait de app/api/banklogs/route.ts (Lot 8).
 */

import { NextResponse } from "next/server";
import { FAMILY_SLUG } from "./constants";

export function jsonOk(payload: unknown, status = 200): NextResponse {
  return NextResponse.json(payload, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export function jsonErr(
  message: string,
  status = 500,
  extra?: Record<string, unknown>
): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: "BANKLOGS_FAILED",
      message,
      familySlug: FAMILY_SLUG,
      ...(extra ?? {}),
    },
    {
      status,
      headers: { "cache-control": "no-store" },
    }
  );
}

/**
 * True si la requête présente un INGEST_SECRET valide (worker / cron interne).
 * False sinon → la route doit alors exiger une auth staff.
 */
export function hasValidIngestSecret(req: Request): boolean {
  const expected = process.env.INGEST_SECRET;
  if (!expected) return false;
  const provided = req.headers.get("x-ingest-secret");
  return Boolean(provided && provided === expected);
}

export function safeJsonParse<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
