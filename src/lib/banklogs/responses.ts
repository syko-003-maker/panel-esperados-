/**
 * Helpers JSON pour /api/banklogs : réponse OK + auth ingest.
 *
 * Extrait de app/api/banklogs/route.ts (Lot 8).
 */

import { NextResponse } from "next/server";

export function jsonOk(payload: unknown, status = 200): NextResponse {
  return NextResponse.json(payload, {
    status,
    headers: { "cache-control": "no-store" },
  });
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
