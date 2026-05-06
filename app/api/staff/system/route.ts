import { NextResponse } from "next/server";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { collectSystemStats } from "@/lib/system-stats";
import { getLygStats } from "@/lib/lyg-stats";
import { ensureOnlineStatusLoopStarted } from "@/lib/online-status-loop";

export const dynamic = "force-dynamic";

/**
 * Cache module-level partagé entre toutes les requêtes du même process Next.js.
 *
 * `collectSystemStats()` spawn `exec` (df, free, etc.) + échantillonne le CPU
 * sur 1.5s — coûteux à exécuter à chaque appel. Avec ce cache 15s :
 *  - 1 seule exécution toutes les 15s, même si 4 onglets staff sont ouverts
 *  - Coalescing : les requêtes concurrentes au moment d'un miss se partagent
 *    la même promise (évite N exec() simultanés sur l'expiration)
 *
 * Polling client côté system-client.tsx : 30s — donc la majorité des hits
 * tombent en cache hit.
 */
const CACHE_TTL_MS = 15_000;
let cachedAt = 0;
let cachedPayload: { system: unknown; lyg: unknown } | null = null;
let inFlight: Promise<{ system: unknown; lyg: unknown }> | null = null;

async function getCachedStats() {
  const now = Date.now();

  if (cachedPayload && now - cachedAt < CACHE_TTL_MS) {
    return cachedPayload;
  }
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const [system, lyg] = await Promise.all([
        collectSystemStats(),
        Promise.resolve(getLygStats()),
      ]);
      const payload = { system, lyg };
      cachedPayload = payload;
      cachedAt = Date.now();
      return payload;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

export async function GET() {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  // S'assurer que le loop online-status tourne (même si personne n'a ouvert /staff/members)
  ensureOnlineStatusLoopStarted();

  const { system, lyg } = await getCachedStats();

  return NextResponse.json(
    { ok: true, system, lyg, timestamp: Date.now() },
    {
      // Hint debug : la réponse est cachée 15s côté serveur.
      headers: { "Cache-Control": "private, max-age=10" },
    },
  );
}
