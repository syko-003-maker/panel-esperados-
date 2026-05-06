import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendDiscordAlert } from "@/lib/alerts";

/**
 * GET /api/cron/worker-watchdog
 *
 * Appelé par le timer systemd `panel-worker-watchdog.timer` toutes les 2 minutes.
 * Vérifie :
 *   1. Heartbeat du discord-worker (alerte si stale > 3 min)
 *   2. Mémoire panel + worker (alerte si > MEMORY_WATCH_MB, défaut 600 MB)
 *
 * Auth : CRON_SECRET (Bearer ou ?secret=).
 *
 * Retourne :
 *   200 + workerAlive=true si tout OK
 *   200 + workerAlive=false si stale (l'alerte a été envoyée)
 *   401 si secret manquant
 */

const FAMILY_ID = "esperados";
const HEARTBEAT_MAX_AGE_MS = 180_000;
const MEMORY_WATCH_MB = Number(process.env.MEMORY_WATCH_MB ?? 600);

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const provided =
    authHeader?.replace("Bearer ", "") ??
    req.nextUrl.searchParams.get("secret");

  if (!cronSecret || provided !== cronSecret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let lastSeenAt: Date | null = null;
  let workerName: string | null = null;
  let workerMemMB: number | null = null;
  let dbReachable = true;
  let dbError: string | null = null;

  try {
    const hb = await (prisma as any).workerHeartbeat?.findUnique({
      where: { familyId: FAMILY_ID },
      select: { lastSeenAt: true, workerName: true, meta: true },
    });
    if (hb?.lastSeenAt) {
      lastSeenAt = new Date(hb.lastSeenAt);
      workerName = hb.workerName ?? null;
      const memMaybe = (hb.meta as any)?.memMB;
      workerMemMB = typeof memMaybe === "number" ? memMaybe : null;
    }
  } catch (err) {
    dbReachable = false;
    dbError = err instanceof Error ? err.message : String(err);
  }

  if (!dbReachable) {
    await sendDiscordAlert({
      key: "watchdog_db_unreachable",
      severity: "critical",
      title: "Watchdog : DB injoignable",
      fields: { error: dbError },
    });
    return NextResponse.json({
      ok: false,
      workerAlive: false,
      reason: "db_unreachable",
      error: dbError,
    }, { status: 200 });
  }

  if (!lastSeenAt) {
    await sendDiscordAlert({
      key: "watchdog_no_heartbeat",
      severity: "error",
      title: "Watchdog : aucun heartbeat worker",
      fields: { familyId: FAMILY_ID, hint: "Worker pas encore démarré ou crash au boot ?" },
    });
    return NextResponse.json({
      ok: false,
      workerAlive: false,
      reason: "no_heartbeat",
    });
  }

  const ageMs = Date.now() - lastSeenAt.getTime();
  const workerAlive = ageMs < HEARTBEAT_MAX_AGE_MS;

  if (!workerAlive) {
    await sendDiscordAlert({
      key: "watchdog_worker_stale",
      severity: "error",
      title: "Watchdog : worker Discord stale",
      fields: {
        workerName: workerName ?? "discord-worker",
        lastSeenAt: lastSeenAt.toISOString(),
        ageSeconds: Math.round(ageMs / 1000),
        thresholdSeconds: HEARTBEAT_MAX_AGE_MS / 1000,
      },
    });
  }

  // ── Surveillance mémoire ────────────────────────────────────────────
  // Mesure :
  //   - panel  : process.memoryUsage().rss du process Next.js courant
  //   - worker : meta.memMB lu depuis WorkerHeartbeat (écrit toutes les 60s)
  // Throttle : sendDiscordAlert dédupe 1 alerte/min/clé, donc safe à appeler
  // toutes les 2 min même si le seuil est dépassé.
  const panelMemMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const memoryWarnings: Array<{ component: string; memMB: number }> = [];
  if (panelMemMB > MEMORY_WATCH_MB) memoryWarnings.push({ component: "panel", memMB: panelMemMB });
  if (workerMemMB != null && workerMemMB > MEMORY_WATCH_MB) {
    memoryWarnings.push({ component: "worker", memMB: workerMemMB });
  }

  for (const w of memoryWarnings) {
    // Log structuré (visible dans journalctl panel)
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "warn",
      event: "memory_threshold_exceeded",
      component: w.component,
      memMB: w.memMB,
      thresholdMB: MEMORY_WATCH_MB,
    }));

    // Alerte Discord (si webhook configuré, sinon log JSON only via fallback)
    await sendDiscordAlert({
      key: `memory_high_${w.component}`,
      severity: "warn",
      title: `Mémoire ${w.component} > ${MEMORY_WATCH_MB} MB`,
      fields: {
        component: w.component,
        currentMB: w.memMB,
        thresholdMB: MEMORY_WATCH_MB,
        action: "Investiguer fuite éventuelle, redémarrer si > 1 GB",
      },
    });
  }

  return NextResponse.json({
    ok: true,
    workerAlive,
    lastSeenAt: lastSeenAt.toISOString(),
    ageMs,
    workerName,
    memory: {
      panelMB: panelMemMB,
      workerMB: workerMemMB,
      thresholdMB: MEMORY_WATCH_MB,
      warnings: memoryWarnings.map((w) => w.component),
    },
  });
}
