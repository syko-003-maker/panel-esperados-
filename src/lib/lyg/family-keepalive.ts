import "server-only";
import { prisma } from "@/lib/db";
import { testLygCookie } from "@/lib/lyg/family-admin";

/**
 * Loop "keep-alive" du cookie families.lyg.fr.
 *
 * Pourquoi : les sessions PHP s'expirent selon `session.gc_maxlifetime`
 * + un timeout d'inactivité serveur. En pinguant le dashboard toutes les
 * 10 min, on garde la session "active" → le cookie reste valable
 * indéfiniment tant que le panel tourne.
 *
 * Le ping est très léger (GET HTML, on jette le body), comparable à un
 * user qui laisse l'onglet ouvert. Pas d'impact significatif côté LYG.
 *
 * Si LYG a réellement invalidé la session (logout manuel par exemple),
 * le ping détecte le redirect vers /login et marque le cookie expiré
 * dans les 10 minutes — l'utilisateur n'a pas à attendre son prochain
 * clic pour le savoir.
 */

const PING_INTERVAL_MS = 10 * 60 * 1000; // 10 min

const g = globalThis as unknown as {
  __lygKeepaliveStarted?: boolean;
};

async function pingOnce(): Promise<void> {
  // On ne fait rien si aucun cookie n'est configuré ou s'il est déjà expiré.
  const cred = await prisma.lygCredential.findFirst({
    select: { familyId: true, expired: true },
  }).catch(() => null);
  if (!cred || cred.expired) return;

  try {
    const result = await testLygCookie();
    if (result.ok) {
      console.log(`[lyg-keepalive] ping ok (${result.tookMs} ms)`);
    } else if ("expired" in result && result.expired) {
      console.warn("[lyg-keepalive] cookie expired — needs refresh");
    } else {
      console.warn(`[lyg-keepalive] ping failed status=${result.status}`);
    }
  } catch (err) {
    console.error(
      "[lyg-keepalive] ping exception:",
      err instanceof Error ? err.message : String(err)
    );
  }
}

async function loop(): Promise<void> {
  while (true) {
    try {
      await pingOnce();
    } catch (err) {
      console.error("[lyg-keepalive] loop iteration error:", err);
    }
    await new Promise((r) => setTimeout(r, PING_INTERVAL_MS));
  }
}

export function ensureLygKeepaliveStarted(): void {
  if (g.__lygKeepaliveStarted) return;
  g.__lygKeepaliveStarted = true;
  console.log(
    `[lyg-keepalive] background loop starting (interval=${PING_INTERVAL_MS / 60_000}min)`
  );
  loop().catch((e) => {
    console.error("[lyg-keepalive] loop crashed", e);
    g.__lygKeepaliveStarted = false;
  });
}
