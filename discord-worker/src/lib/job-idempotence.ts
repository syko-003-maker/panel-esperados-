/**
 * Job-level idempotence system for Discord worker
 * Prevents double execution of decision actions (recruitment, complaints)
 */

import { PrismaClient, Prisma } from "@prisma/client";
import { logInfo, logWarn, logError } from "./worker-obs.js";

const prisma = new PrismaClient();

/**
 * Start a job with idempotence check
 * @returns true if job started (new), false if already exists (dedupe)
 */
export async function startJob(
  jobKey: string,
  type: string
): Promise<boolean> {
  try {
    await prisma.jobRun.create({
      data: {
        jobKey,
        type,
        status: "started",
      },
    });
    
    logInfo("job_started", { jobKey, type });
    return true;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Unique constraint violation = job already exists
      logWarn("job_deduped", { jobKey, type });
      return false;
    }
    
    // Other error - log and re-throw
    logError("job_start_error", { jobKey, type }, error);
    throw error;
  }
}

/**
 * Mark a job as completed
 */
export async function finishJob(
  jobKey: string,
  status: "done" | "failed"
): Promise<void> {
  try {
    await prisma.jobRun.update({
      where: { jobKey },
      data: {
        status,
        updatedAt: new Date(),
      },
    });
    
    logInfo("job_finished", { jobKey, status });
  } catch (error) {
    logError("job_finish_error", { jobKey, status }, error);
    // Non-blocking: don't throw, just log
  }
}

/**
 * Get job status (for testing/debugging)
 */
export async function getJobStatus(
  jobKey: string
): Promise<{ exists: boolean; status?: string }> {
  try {
    const job = await prisma.jobRun.findUnique({
      where: { jobKey },
      select: { status: true },
    });
    
    if (!job) {
      return { exists: false };
    }
    
    return { exists: true, status: job.status };
  } catch (error) {
    logError("job_status_error", { jobKey }, error);
    return { exists: false };
  }
}
