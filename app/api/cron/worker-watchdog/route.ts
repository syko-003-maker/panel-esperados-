import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendDiscordAlert } from "@/lib/alerts";

/**
 * GET /api/cron/worker-watchdog
 *
 * Appelé par le timer systemd `panel-worker-watchdog.timer` toutes les 2 minutes.
 * Vérifie le heartbeat du discord-worker et envoie une alerte Discord si
 * stale > 3 minutes.
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
  let dbReachable = true;
  let dbError: string | null = null;

  try {
    const hb = await (prisma as any).workerHeartbeat?.findUnique({
      where: { familyId: FAMILY_ID },
      select: { lastSeenAt: true, workerName: true },
    });
    if (hb?.lastSeenAt) {
      lastSeenAt = new Date(hb.lastSeenAt);
      workerName = hb.workerName ?? null;
    }
  } catch (err) {
    dbReachable = false;
    dbError = err instanceof Error ? err.message : String(err);
  }

  if (!dbReachable) {
    // DB injoignable depuis le panel : alerte critique
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
    // Pas de heartbeat : le worker n'a jamais écrit (ou table vide)
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

  return NextResponse.json({
    ok: true,
    workerAlive,
    lastSeenAt: lastSeenAt.toISOString(),
    ageMs,
    workerName,
  });
}
