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

const FAMILY_ID = "esperados";
const WORKER_NAME = "discord-worker";
const INTERVAL_MS = 60_000;

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
