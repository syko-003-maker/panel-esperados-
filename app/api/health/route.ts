import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { toFamilyCuid } from "@/lib/family";

const FAMILY_SLUG = "esperados";
const WORKER_HEALTHCHECK_URL = process.env.WORKER_HEALTHCHECK_URL ?? "http://127.0.0.1:3001/health";
const HEARTBEAT_MAX_AGE_MS = 180_000; // 3 min

export async function GET() {
  let dbOk = false;
  let dbError: string | null = null;

  try {
    // Check DB connection
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch (e) {
    dbError = process.env.NODE_ENV === "production" ? "db_error" : e instanceof Error ? e.message : "Unknown DB error";
  }

  // Worker — vérifié via 2 signaux indépendants :
  //   1. HTTP ping :3001/health (signal principal, rapide)
  //   2. Heartbeat DB lastSeenAt < 3 min (secondaire, marche même si HTTP worker KO)
  // Le worker est considéré vivant si AU MOINS UN des deux signaux est OK.
  const workerHttp = await pingWorkerHttp();
  const workerHeartbeat = await readWorkerHeartbeat();
  const workerAlive = workerHttp.alive || workerHeartbeat.alive;

  const overallOk = dbOk && workerAlive;
  const status = overallOk ? 200 : 503;

  return NextResponse.json(
    {
      ok: overallOk,
      db: dbOk,
      dbError,
      worker: {
        alive: workerAlive,
        http: workerHttp,
        heartbeat: workerHeartbeat,
      },
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "unknown",
    },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

async function pingWorkerHttp(): Promise<{
  alive: boolean;
  status?: number;
  error?: string;
  durationMs?: number;
}> {
  const started = Date.now();
  try {
    const res = await fetch(WORKER_HEALTHCHECK_URL, {
      method: "GET",
      signal: AbortSignal.timeout(2500),
    });
    const durationMs = Date.now() - started;
    return { alive: res.ok, status: res.status, durationMs };
  } catch (err) {
    return {
      alive: false,
      durationMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function readWorkerHeartbeat(): Promise<{
  alive: boolean;
  lastSeenAt?: string;
  ageMs?: number;
  workerName?: string | null;
  meta?: unknown;
  error?: string;
}> {
  try {
    // Cast en any : le client Prisma peut ne pas exposer le model
    // si la migration n'a pas encore été appliquée — on tolère ce cas.
    const hb = await (prisma as any).workerHeartbeat?.findUnique({
      where: { familyId: await toFamilyCuid(FAMILY_SLUG) },
      select: { lastSeenAt: true, workerName: true, meta: true },
    });
    if (!hb) return { alive: false, error: "no_heartbeat_row" };
    const ageMs = Date.now() - new Date(hb.lastSeenAt).getTime();
    return {
      alive: ageMs < HEARTBEAT_MAX_AGE_MS,
      lastSeenAt: new Date(hb.lastSeenAt).toISOString(),
      ageMs,
      workerName: hb.workerName ?? null,
      meta: hb.meta ?? null,
    };
  } catch (err) {
    return { alive: false, error: err instanceof Error ? err.message : String(err) };
  }
}
