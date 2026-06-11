import "server-only";
import { prisma } from "@/lib/db";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";
import { createAuditLog } from "@/lib/audit";
import {
  testLygCookie,
  lygFamilyAdd,
  lygFamilyRemove,
  lygFamilyRankUp,
  lygFamilyRankDown,
} from "@/lib/lyg/family-admin";

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
      // Cookie valide → on en profite pour appliquer automatiquement les
      // changements WL "planifiés" (intent ≠ réel). Avant : ils restaient
      // affichés comme "à reporter sur families.lyg.fr" indéfiniment.
      await autoApplyPendingIntents().catch((err) =>
        console.error(
          "[lyg-keepalive] auto-apply exception:",
          err instanceof Error ? err.message : String(err)
        )
      );
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


// Nombre max de membres traités par cycle (10 min) — on reste doux avec LYG.
const MAX_AUTO_APPLY_PER_CYCLE = 5;

/**
 * Applique automatiquement les intents WL en attente (classe uniquement —
 * il n'existe pas d'action "owner" côté proxy). Pour chaque membre dont
 * wlClassIntent ≠ wlClass : add / del / up / down jusqu'à atteindre la cible,
 * puis mise à jour locale + audit. Au premier échec on s'arrête (cookie
 * probablement expiré) — le diff reste visible sur la page Famille WL.
 */
async function autoApplyPendingIntents(): Promise<void> {
  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  const candidates = await prisma.member.findMany({
    where: {
      familyId: familyDbId,
      isActive: true,
      isGhost: false,
      steamId: { not: null },
    },
    select: { id: true, rpName: true, steamId: true, wlClass: true, wlClassIntent: true },
  });

  const pending = candidates.filter((m) => (m.wlClassIntent ?? null) !== (m.wlClass ?? null));
  if (pending.length === 0) return;

  console.log(`[lyg-keepalive] auto-apply: ${pending.length} changement(s) WL en attente`);

  for (const m of pending.slice(0, MAX_AUTO_APPLY_PER_CYCLE)) {
    const steamId = m.steamId as string;
    const want = m.wlClassIntent ?? null;
    let real = m.wlClass ?? null;
    let ok = true;
    let lastError: string | null = null;

    if (want === null && real !== null) {
      const r = await lygFamilyRemove(steamId);
      ok = r.ok;
      if (ok) real = null;
      else lastError = (r as any).error ?? `status ${r.status}`;
    } else if (want !== null) {
      if (real === null) {
        const r = await lygFamilyAdd(steamId);
        ok = r.ok;
        if (ok) real = 4; // LYG ajoute en classe 4 par défaut
        else lastError = (r as any).error ?? `status ${r.status}`;
      }
      let guard = 0;
      while (ok && real !== null && real !== want && guard < 5) {
        guard += 1;
        const r = real > want ? await lygFamilyRankUp(steamId, real) : await lygFamilyRankDown(steamId, real);
        ok = r.ok;
        if (ok) real = real > want ? real - 1 : real + 1;
        else lastError = (r as any).error ?? `status ${r.status}`;
      }
    }

    if (ok) {
      await prisma.member.update({
        where: { id: m.id },
        data: { wlClass: real, wlIntentUpdatedAt: new Date() },
      });
      await createAuditLog({
        actorType: "system",
        actorId: null,
        actorName: "lyg-keepalive",
        action: "LYG_WL_AUTO_APPLIED",
        entity: "Member",
        entityId: m.id,
        entityName: m.rpName,
        meta: { steamId, from: m.wlClass ?? null, to: want },
      });
      console.log(`[lyg-keepalive] auto-apply ok: ${m.rpName} WL ${m.wlClass ?? "∅"} → ${want ?? "∅"}`);
    } else {
      await createAuditLog({
        actorType: "system",
        actorId: null,
        actorName: "lyg-keepalive",
        action: "LYG_WL_AUTO_APPLY_FAILED",
        entity: "Member",
        entityId: m.id,
        entityName: m.rpName,
        meta: { steamId, from: m.wlClass ?? null, to: want, error: lastError },
      });
      console.warn(`[lyg-keepalive] auto-apply ÉCHEC: ${m.rpName} (${lastError}) — arrêt du cycle`);
      break;
    }
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
