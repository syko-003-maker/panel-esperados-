/**
 * Expiration automatique des sanctions arrivées à échéance.
 *
 * Pourquoi ce déclencheur existe : la route `/api/admin/expire-sanctions`
 * était présente depuis le commit initial, annonçait « Called by cron job »
 * dans son en-tête… et n'était appelée par personne. L'expiration se faisait
 * en réalité dans le handler GET de la liste des sanctions du panel, avec des
 * critères strictement identiques.
 *
 * Autrement dit : les sanctions n'expiraient que si un membre du staff ouvrait
 * la page. Aucune sanction n'était en retard au moment du branchement (garde
 * tenue socialement), mais rien ne le garantissait — quelques jours sans
 * consultation et les rôles d'avertissement restaient posés au-delà de leur
 * échéance.
 *
 * L'opération est idempotente : le `where` porte sur `status: "ACTIVE"`, donc
 * une sanction déjà expirée n'est pas reprise. Une exécution simultanée avec
 * le chemin GET du panel ne produit au pire qu'un `REMOVE_ROLE` en double,
 * type lui-même idempotent (retirer deux fois un rôle donne le même état).
 */

import { getInternalPanelUrl } from "./lib/urls.js";
import { fetchWithTimeout } from "./lib/http.js";

/** 15 min : l'échéance des sanctions se compte en heures ou en jours, pas en
 *  minutes. Assez fréquent pour que le retard reste imperceptible, assez rare
 *  pour ne rien coûter. Aucun appel LYG — la route ne parle qu'à PostgreSQL
 *  et à l'outbox. */
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;

let lastExpireSanctionsAt = 0;
let isRunning = false;

function parseIntervalMs(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 60_000) return fallback;
  return Math.floor(parsed);
}

export function getExpireSanctionsIntervalMs(): number {
  return parseIntervalMs(process.env.EXPIRE_SANCTIONS_INTERVAL_MS, DEFAULT_INTERVAL_MS);
}

export function getLastExpireSanctionsAt(): number {
  return lastExpireSanctionsAt;
}

export async function runExpireSanctionsJob(): Promise<void> {
  // Garde anti-double-exécution : un cycle lent ne doit pas se superposer au
  // suivant. Le verrou est en mémoire, donc propre à ce processus — c'est
  // suffisant, le worker étant déjà mono-instance (WorkerHeartbeat).
  if (isRunning) {
    console.warn("[EXPIRE_SANCTIONS] skip: run précédent encore en cours");
    return;
  }
  isRunning = true;
  try {
    await runExpireSanctionsJobInner();
  } finally {
    isRunning = false;
  }
}

async function runExpireSanctionsJobInner(): Promise<void> {
  const baseUrl = getInternalPanelUrl();
  const secret = String(process.env.INGEST_SECRET ?? process.env.DISCORD_WORKER_SECRET ?? "").trim();

  if (!baseUrl || !secret) {
    console.warn("[EXPIRE_SANCTIONS] skipped: missing INGEST_BASE_URL or INGEST_SECRET");
    return;
  }

  try {
    const response = await fetchWithTimeout(`${baseUrl}/api/admin/expire-sanctions`, {
      method: "POST",
      headers: { "x-ingest-secret": secret },
    });

    const bodyText = await response.text().catch(() => "");

    if (!response.ok) {
      console.error("[EXPIRE_SANCTIONS] failed", {
        status: response.status,
        body: bodyText.slice(0, 300),
      });
      return;
    }

    lastExpireSanctionsAt = Date.now();

    // On journalise le nombre expiré plutôt qu'un « ok » indifférencié : c'est
    // la seule façon de distinguer « rien à expirer » de « la route ne voit
    // rien » — la panne muette qu'on vient précisément de corriger côté
    // familyId, où le `where` sur le slug ne remontait aucune sanction.
    let expired: number | null = null;
    try {
      const parsed = JSON.parse(bodyText) as { expired?: unknown; count?: unknown };
      const value = typeof parsed.expired === "number" ? parsed.expired : parsed.count;
      if (typeof value === "number") expired = value;
    } catch {
      // Corps illisible : on le laisse visible dans le log ci-dessous.
    }

    console.log("[EXPIRE_SANCTIONS] ok", {
      status: response.status,
      ...(expired !== null ? { expired } : { body: bodyText.slice(0, 200) }),
      ranAt: new Date(lastExpireSanctionsAt).toISOString(),
    });
  } catch (error) {
    console.error("[EXPIRE_SANCTIONS] exception", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
