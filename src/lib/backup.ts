/**
 * Database Backup & Retention Utilities
 * Supports PostgreSQL backups via pg_dump
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import { recordPanelMetric } from "@/lib/metrics";

const execAsync = promisify(exec);
const fsPromises = fs.promises;

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

const DB_BACKUP_PATH = process.env.DB_BACKUP_PATH ?? "./backups";
const DB_BACKUP_RETENTION_DAYS = parseInt(process.env.DB_BACKUP_RETENTION_DAYS ?? "30", 10);

// Parse DATABASE_URL for pg_dump
function parseDatabaseUrl(): {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
} | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;

  try {
    // postgresql://user:password@host:port/database
    const match = url.match(/postgresql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
    if (!match) return null;

    return {
      user: match[1],
      password: match[2],
      host: match[3],
      port: match[4],
      database: match[5].split("?")[0], // Remove query params
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// Backup Functions
// ─────────────────────────────────────────────────────────────

export type BackupResult = {
  success: boolean;
  filename?: string;
  path?: string;
  size?: number;
  error?: string;
};

/**
 * Validate backup path exists and is writable
 */
export async function validateBackupPath(): Promise<{ valid: boolean; error?: string }> {
  try {
    // Create directory if it doesn't exist
    await fsPromises.mkdir(DB_BACKUP_PATH, { recursive: true });

    // Test write access
    const testFile = path.join(DB_BACKUP_PATH, ".write-test");
    await fsPromises.writeFile(testFile, "test");
    await fsPromises.unlink(testFile);

    return { valid: true };
  } catch (error: any) {
    return { valid: false, error: error.message ?? "Invalid backup path" };
  }
}

/**
 * Create a database backup
 */
export async function createBackup(): Promise<BackupResult> {
  // Validate path first
  const pathCheck = await validateBackupPath();
  if (!pathCheck.valid) {
    return { success: false, error: pathCheck.error };
  }

  const dbConfig = parseDatabaseUrl();
  if (!dbConfig) {
    return { success: false, error: "Invalid DATABASE_URL" };
  }

  // Generate filename with timestamp
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 12);
  const filename = `backup-${timestamp}.sql`;
  const backupPath = path.join(DB_BACKUP_PATH, filename);

  try {
    // Set PGPASSWORD environment variable for pg_dump
    const env = { ...process.env, PGPASSWORD: dbConfig.password };

    // Execute pg_dump
    const command = `pg_dump -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} -F p -f "${backupPath}"`;

    await execAsync(command, { env });

    // Get file size
    const stats = await fsPromises.stat(backupPath);

    // Record metric
    await recordPanelMetric("db.backup", filename, {
      size: stats.size,
      path: backupPath,
    });

    return {
      success: true,
      filename,
      path: backupPath,
      size: stats.size,
    };
  } catch (error: any) {
    return { success: false, error: error.message ?? "Backup failed" };
  }
}

// ─────────────────────────────────────────────────────────────
// Retention Functions
// ─────────────────────────────────────────────────────────────

export type RetentionResult = {
  success: boolean;
  deleted: string[];
  kept: number;
  error?: string;
};

/**
 * List all backup files
 */
export async function listBackups(): Promise<{ filename: string; createdAt: Date; size: number }[]> {
  try {
    const files = await fsPromises.readdir(DB_BACKUP_PATH);
    const backups: { filename: string; createdAt: Date; size: number }[] = [];

    for (const file of files) {
      if (!file.startsWith("backup-") || !file.endsWith(".sql")) continue;

      const filePath = path.join(DB_BACKUP_PATH, file);
      const stats = await fsPromises.stat(filePath);

      backups.push({
        filename: file,
        createdAt: stats.mtime,
        size: stats.size,
      });
    }

    return backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  } catch {
    return [];
  }
}

/**
 * Clean old backups based on retention policy
 */
export async function cleanOldBackups(): Promise<RetentionResult> {
  const pathCheck = await validateBackupPath();
  if (!pathCheck.valid) {
    return { success: false, deleted: [], kept: 0, error: pathCheck.error };
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - DB_BACKUP_RETENTION_DAYS);

  const backups = await listBackups();
  const deleted: string[] = [];
  let kept = 0;

  try {
    for (const backup of backups) {
      if (backup.createdAt < cutoffDate) {
        const filePath = path.join(DB_BACKUP_PATH, backup.filename);
        await fsPromises.unlink(filePath);
        deleted.push(backup.filename);
      } else {
        kept++;
      }
    }

    // Record metric
    await recordPanelMetric("db.retention", null, {
      deleted: deleted.length,
      kept,
      retentionDays: DB_BACKUP_RETENTION_DAYS,
    });

    return { success: true, deleted, kept };
  } catch (error: any) {
    return { success: false, deleted, kept, error: error.message ?? "Retention cleanup failed" };
  }
}

// ─────────────────────────────────────────────────────────────
// Restore Functions
// ─────────────────────────────────────────────────────────────

export type RestoreResult = {
  success: boolean;
  error?: string;
};

/**
 * Check if restore is allowed
 */
export function isRestoreAllowed(): boolean {
  return process.env.ALLOW_DB_RESTORE === "true";
}

/**
 * Restore from a backup file
 */
export async function restoreBackup(filename: string): Promise<RestoreResult> {
  if (!isRestoreAllowed()) {
    return { success: false, error: "Restore not allowed. Set ALLOW_DB_RESTORE=true" };
  }

  const dbConfig = parseDatabaseUrl();
  if (!dbConfig) {
    return { success: false, error: "Invalid DATABASE_URL" };
  }

  const backupPath = path.join(DB_BACKUP_PATH, filename);

  // Check file exists
  try {
    await fsPromises.access(backupPath);
  } catch {
    return { success: false, error: `Backup file not found: ${filename}` };
  }

  try {
    const env = { ...process.env, PGPASSWORD: dbConfig.password };
    const command = `psql -h ${dbConfig.host} -p ${dbConfig.port} -U ${dbConfig.user} -d ${dbConfig.database} -f "${backupPath}"`;

    await execAsync(command, { env });

    await recordPanelMetric("db.restore", filename, {
      path: backupPath,
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message ?? "Restore failed" };
  }
}

// ─────────────────────────────────────────────────────────────
// Export config for API
// ─────────────────────────────────────────────────────────────

export function getBackupConfig() {
  return {
    path: DB_BACKUP_PATH,
    retentionDays: DB_BACKUP_RETENTION_DAYS,
    restoreAllowed: isRestoreAllowed(),
  };
}
