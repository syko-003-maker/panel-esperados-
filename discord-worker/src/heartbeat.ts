/**
 * Heartbeat worker — écrit dans la table WorkerHeartbeat toutes les 60s.
 * Le panel watchdog (cron) lit cette ligne pour savoir si le worker est vivant.
 *
 * Schema Prisma :
 *   model WorkerHeartbeat {
 *     id, familyId @unique, workerName, lastSeenAt, meta, ...
 *   }
 *
 * Stratégie : upsert sur familyId pour ne pas accumuler les rows.
 * Échec silencieux (log only) — un crash DB ne doit pas tuer le worker.
 */

import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const FAMILY_ID = "esperados";
const WORKER_NAME = "discord-worker";
const INTERVAL_MS = 60_000;

// Identité unique de CETTE instance + TTL du verrou mono-instance.
// TTL > 2× l'intervalle de heartbeat : une instance vivante rafraîchit toujours
// le lock dans la fenêtre ; au-delà de LOCK_TTL_MS sans battement, le lock est
// considéré périmé (crash) et une nouvelle instance peut le reprendre.
const INSTANCE_ID = randomUUID();
const LOCK_TTL_MS = 150_000;

let intervalId: NodeJS.Timeout | null = null;
let prisma: PrismaClient | null = null;
let bootAt = Date.now();

function getPrisma(): PrismaClient {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

async function tick(): Promise<void> {
  try {
    const meta = {
      instanceId: INSTANCE_ID, // garde la propriété du verrou mono-instance
      uptimeSec: Math.round((Date.now() - bootAt) / 1000),
      pid: process.pid,
      memMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
      nodeEnv: process.env.NODE_ENV ?? "production",
    };

    const client = getPrisma();
    await client.workerHeartbeat.upsert({
      where: { familyId: FAMILY_ID },
      create: {
        familyId: FAMILY_ID,
        workerName: WORKER_NAME,
        lastSeenAt: new Date(),
        meta,
      },
      update: {
        workerName: WORKER_NAME,
        lastSeenAt: new Date(),
        meta,
      },
    });
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      event: "heartbeat_write_failed",
      error: err instanceof Error ? err.message : String(err),
    }));
    // pas de throw — le worker continue
  }
}

/**
 * Verrou mono-instance : empêche deux workers de tourner en parallèle (double
 * bot, doubles pollers, doubles effets de bord). Basé sur la ligne unique
 * WorkerHeartbeat(familyId) + un instanceId.
 *
 * Renvoie true si le lock est acquis (on peut démarrer), false si une AUTRE
 * instance est vivante (battement récent, instanceId différent).
 *
 * Fail-open en cas d'erreur DB (on logge mais on ne bloque pas le démarrage) :
 * la vraie garantie reste systemd (1 unité) ; ceci est une défense en
 * profondeur contre un double-lancement accidentel.
 */
export async function acquireSingleInstanceLock(): Promise<boolean> {
  const client = getPrisma();
  try {
    return await client.$transaction(async (tx) => {
      const existing = await tx.workerHeartbeat.findUnique({ where: { familyId: FAMILY_ID } });
      const now = Date.now();
      if (existing) {
        const lastBeat = existing.lastSeenAt ? existing.lastSeenAt.getTime() : 0;
        const otherInstance = (existing.meta as { instanceId?: string } | null)?.instanceId;
        const fresh = now - lastBeat < LOCK_TTL_MS;
        if (fresh && otherInstance && otherInstance !== INSTANCE_ID) {
          return false; // une autre instance vivante détient le verrou
        }
        await tx.workerHeartbeat.update({
          where: { familyId: FAMILY_ID },
          data: {
            workerName: WORKER_NAME,
            lastSeenAt: new Date(),
            meta: { instanceId: INSTANCE_ID, pid: process.pid, claimedAt: new Date().toISOString() },
          },
        });
      } else {
        await tx.workerHeartbeat.create({
          data: {
            familyId: FAMILY_ID,
            workerName: WORKER_NAME,
            lastSeenAt: new Date(),
            meta: { instanceId: INSTANCE_ID, pid: process.pid, claimedAt: new Date().toISOString() },
          },
        });
      }
      return true;
    });
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      event: "single_instance_lock_error",
      error: err instanceof Error ? err.message : String(err),
    }));
    return true; // fail-open
  }
}

/**
 * Libère le verrou mono-instance à l'arrêt (SIGTERM/SIGINT) : supprime la ligne
 * WorkerHeartbeat SI on en est encore le propriétaire (instanceId == le nôtre).
 *
 * Sans ça, après un arrêt la ligne reste « fraîche » jusqu'à LOCK_TTL_MS (150s)
 * et la nouvelle instance se refuse le démarrage → crash-loop de ~150s à CHAQUE
 * redémarrage / déploiement du worker. On ne supprime pas si une AUTRE instance
 * a déjà repris le lock. Best-effort, non bloquant.
 */
export async function releaseSingleInstanceLock(): Promise<void> {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  try {
    const client = getPrisma();
    await client.$transaction(async (tx) => {
      const existing = await tx.workerHeartbeat.findUnique({ where: { familyId: FAMILY_ID } });
      const owner = (existing?.meta as { instanceId?: string } | null)?.instanceId;
      if (existing && owner === INSTANCE_ID) {
        await tx.workerHeartbeat.delete({ where: { familyId: FAMILY_ID } });
      }
    });
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      event: "single_instance_lock_release_error",
      error: err instanceof Error ? err.message : String(err),
    }));
  }
}

export function startHeartbeat(): void {
  if (intervalId) return;
  bootAt = Date.now();
  // Premier tick immédiat (utile au boot pour le watchdog)
  void tick();
  intervalId = setInterval(() => void tick(), INTERVAL_MS);
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: "info",
    event: "heartbeat_started",
    intervalMs: INTERVAL_MS,
  }));
}

export function stopHeartbeat(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  if (prisma) {
    void prisma.$disconnect().catch(() => { /* noop */ });
    prisma = null;
  }
}
