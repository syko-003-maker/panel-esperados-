import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// Worker health state (updated by worker process)
let workerLastActivity = Date.now();
let workerProcessingOutbox = false;

// Export functions for worker to call
export function updateWorkerActivity() {
  workerLastActivity = Date.now();
  workerProcessingOutbox = true;
}

export function workerHeartbeat() {
  workerLastActivity = Date.now();
}

export async function GET() {
  const now = Date.now();
  const timeSinceLastActivity = now - workerLastActivity;
  const staleThresholdMs = 5 * 60 * 1000; // 5 minutes

  // Check database connection
  let dbStatus = "ok";
  let dbError = null;
  
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    dbStatus = "error";
    dbError = error instanceof Error ? error.message : "Unknown error";
  }

  // Check worker activity
  const workerStatus = timeSinceLastActivity > staleThresholdMs ? "stale" : "ok";
  const workerLastActivityAt = new Date(workerLastActivity).toISOString();

  // Overall status
  const overallStatus = 
    dbStatus === "ok" && workerStatus === "ok" ? "ok" : "degraded";

  const statusCode = overallStatus === "ok" ? 200 : 503;

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks: {
        database: {
          status: dbStatus,
          error: dbError,
        },
        worker: {
          status: workerStatus,
          lastActivityAt: workerLastActivityAt,
          timeSinceLastActivityMs: timeSinceLastActivity,
          isProcessing: workerProcessingOutbox,
        },
        api: {
          status: "ok",
        },
      },
    },
    { status: statusCode }
  );
}
