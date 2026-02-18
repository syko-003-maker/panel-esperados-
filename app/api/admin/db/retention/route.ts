import { NextRequest, NextResponse } from "next/server";
import { requireChef } from "@/lib/guards";
import { cleanOldBackups, getBackupConfig, listBackups } from "@/lib/backup";

/**
 * POST /api/admin/db/retention
 * Clean old backups based on retention policy
 */
export async function POST(req: NextRequest) {
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  try {
    const result = await cleanOldBackups();

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      deleted: result.deleted,
      deletedCount: result.deleted.length,
      kept: result.kept,
    });
  } catch (error: any) {
    console.error("[/api/admin/db/retention POST]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Retention cleanup failed" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/db/retention
 * Get retention status
 */
export async function GET(req: NextRequest) {
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  try {
    const config = getBackupConfig();
    const backups = await listBackups();

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - config.retentionDays);

    const eligible = backups.filter((b) => b.createdAt < cutoffDate);
    const kept = backups.filter((b) => b.createdAt >= cutoffDate);

    return NextResponse.json({
      ok: true,
      config: {
        retentionDays: config.retentionDays,
        cutoffDate: cutoffDate.toISOString(),
      },
      totalBackups: backups.length,
      eligibleForDeletion: eligible.length,
      willBeKept: kept.length,
      eligibleFiles: eligible.map((b) => b.filename),
    });
  } catch (error: any) {
    console.error("[/api/admin/db/retention GET]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to get retention status" },
      { status: 500 }
    );
  }
}
