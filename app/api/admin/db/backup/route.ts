import { NextRequest, NextResponse } from "next/server";
import { requireChef } from "@/lib/guards";
import { createBackup, listBackups, getBackupConfig, validateBackupPath } from "@/lib/backup";

/**
 * POST /api/admin/db/backup
 * Create a database backup
 */
export async function POST(req: NextRequest) {
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  try {
    // Validate path first
    const pathCheck = await validateBackupPath();
    if (!pathCheck.valid) {
      return NextResponse.json(
        { ok: false, error: `Invalid backup path: ${pathCheck.error}` },
        { status: 400 }
      );
    }

    const result = await createBackup();

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      backup: {
        filename: result.filename,
        path: result.path,
        size: result.size,
        sizeHuman: formatBytes(result.size ?? 0),
      },
    });
  } catch (error: any) {
    console.error("[/api/admin/db/backup POST]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Backup failed" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/db/backup
 * List all backups
 */
export async function GET(req: NextRequest) {
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  try {
    const backups = await listBackups();
    const config = getBackupConfig();

    return NextResponse.json({
      ok: true,
      config,
      backups: backups.map((b) => ({
        filename: b.filename,
        createdAt: b.createdAt.toISOString(),
        size: b.size,
        sizeHuman: formatBytes(b.size),
      })),
    });
  } catch (error: any) {
    console.error("[/api/admin/db/backup GET]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to list backups" },
      { status: 500 }
    );
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
