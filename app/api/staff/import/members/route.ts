import { NextRequest, NextResponse } from "next/server";
import { requirePrivileged, requireFullWriter } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID } from "@/lib/family";
import { normalizeSteamId64 } from "@/lib/validation/steamid";
import {
  parseCSV,
  validateRow,
  findDuplicates,
  getGradeLevel,
  type ImportRowData,
} from "@/lib/import-validation";
import type { ImportRowAction, ImportSource, GradeChangeSource } from "@prisma/client";

/**
 * GET /api/staff/import/members
 * List recent import runs
 */
export async function GET(req: NextRequest) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const familyId = req.nextUrl.searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10);

  try {
    const runs = await prisma.importRun.findMany({
      where: { familyId },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        source: true,
        fileName: true,
        totalRows: true,
        insertedCount: true,
        updatedCount: true,
        skippedCount: true,
        errorCount: true,
        createdAt: true,
        createdByUserId: true,
      },
    });

    return NextResponse.json({ ok: true, runs });
  } catch (error) {
    console.error("[/api/staff/import/members GET]", error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch import runs" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/staff/import/members
 * Import members from CSV or JSON
 */
export async function POST(req: NextRequest) {
  const guard = await requireFullWriter();
  if (guard instanceof Response) return guard;

  const session = guard.session as any;
  const userId = session?.userId ?? session?.user?.id ?? null;
  const familyId = req.nextUrl.searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;

  let rows: ImportRowData[] = [];
  let source: ImportSource = "CSV";
  let fileName: string | null = null;

  // Parse input (multipart or JSON)
  const contentType = req.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
      }

      fileName = file.name;
      const text = await file.text();
      rows = parseCSV(text);
      source = "CSV";
    } else if (contentType.includes("application/json")) {
      const body = await req.json();

      if (Array.isArray(body.rows)) {
        rows = body.rows;
        source = (body.source as ImportSource) ?? "API";
      } else if (Array.isArray(body)) {
        rows = body;
        source = "API";
      } else {
        return NextResponse.json({ ok: false, error: "Invalid JSON format" }, { status: 400 });
      }
    } else {
      return NextResponse.json(
        { ok: false, error: "Unsupported content type" },
        { status: 400 }
      );
    }

    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: "No rows to import" }, { status: 400 });
    }

    // Check for duplicates in file
    const duplicates = findDuplicates(rows);
    if (duplicates.size > 0) {
      const dupErrors = Array.from(duplicates.entries()).map(([id, indices]) => ({
        discordId: id,
        rows: indices,
        message: `Discord ID en double aux lignes ${indices.join(", ")}`,
      }));
      return NextResponse.json(
        { ok: false, error: "Duplicates found", duplicates: dupErrors },
        { status: 400 }
      );
    }

    // Create import run
    const importRun = await prisma.importRun.create({
      data: {
        familyId,
        source,
        createdByUserId: userId,
        fileName,
        totalRows: rows.length,
      },
    });

    // Process each row
    let insertedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const errorSummaries: Array<{ row: number; message: string }> = [];
    const logs: Array<{
      row: number;
      discordId?: string | null;
      steamId?: string | null;
      rpName?: string | null;
      grade?: string | null;
      action?: string;
      level?: "info" | "warn" | "error";
      message?: string;
    }> = [];

    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 2; // +1 for 0-index, +1 for header
      const validated = validateRow(rows[i], rowNumber);

      if (!validated.isValid || !validated.data.discordId) {
        // Log error
        const message = validated.errors.map((e) => e.message).join("; ") || "Invalid data";
        await prisma.importRowLog.create({
          data: {
            importRunId: importRun.id,
            rowNumber,
            discordId: validated.data.discordId,
            steamId: validated.data.steamId,
            rpName: validated.data.rpName,
            grade: validated.data.grade,
            action: "ERROR",
            message,
          },
        });
        errorSummaries.push({ row: rowNumber, message });
        errorCount++;
        continue;
      }

      const { discordId, steamId, rpName, grade, gradeLevel, joinedAt, age } = validated.data;

      try {
        // Check existing member
        const existing = await prisma.member.findUnique({
          where: { familyId_discordId: { familyId, discordId } },
        });

        if (existing) {
          // Check if grade changed
          const gradeChanged = grade && existing.grade !== grade;

          // Update existing
          await prisma.member.update({
            where: { id: existing.id },
            data: {
              steamId: steamId ?? existing.steamId,
              rpName: rpName ?? existing.rpName,
              grade: grade ?? existing.grade,
              gradeLevel: gradeLevel ?? existing.gradeLevel,
              age: age ?? existing.age,
              joinedAt: joinedAt ?? existing.joinedAt,
            },
          });

          // Record grade history if changed
          if (gradeChanged && grade) {
            await prisma.gradeHistory.create({
              data: {
                memberId: existing.id,
                oldGrade: existing.grade,
                oldGradeLevel: existing.gradeLevel,
                newGrade: grade,
                newGradeLevel: gradeLevel,
                source: "MIGRATION",
                changedBy: userId,
                notes: `Import depuis ${source}`,
              },
            });
          }

          await prisma.importRowLog.create({
            data: {
              importRunId: importRun.id,
              rowNumber,
              discordId,
              steamId,
              rpName,
              grade,
              action: "UPDATE",
              message: gradeChanged ? `Grade updated: ${existing.grade} → ${grade}` : null,
            },
          });
          updatedCount++;
        } else {
          // ✅ Validation SteamID avant création
          const validatedSteamId = normalizeSteamId64(steamId);
          if (!validatedSteamId && steamId) {
            logs.push({
              row: i + 1,
              discordId,
              steamId,
              rpName,
              grade,
              action: "SKIP",
              message: `Invalid SteamID64 format: ${steamId}`,
            });
            skippedCount++;
            continue;
          }

          // Create new member
          const member = await prisma.member.create({
            data: {
              familyId,
              discordId,
              steamId: validatedSteamId,
              rpName,
              grade,
              gradeLevel,
              age,
              joinedAt: joinedAt ?? new Date(),
              isActive: false, // ✅ Only LYG sync sets isActive=true
              source: "MANUAL" as const, // ✅ Provenance: Import manuel
            },
          });

          // Record initial grade history
          if (grade) {
            await prisma.gradeHistory.create({
              data: {
                memberId: member.id,
                oldGrade: null,
                oldGradeLevel: null,
                newGrade: grade,
                newGradeLevel: gradeLevel,
                source: "MIGRATION",
                changedBy: userId,
                notes: `Import initial depuis ${source}`,
              },
            });
          }

          await prisma.importRowLog.create({
            data: {
              importRunId: importRun.id,
              rowNumber,
              discordId,
              steamId,
              rpName,
              grade,
              action: "INSERT",
            },
          });
          insertedCount++;
        }
      } catch (dbError: any) {
        const message = dbError.message?.slice(0, 200) ?? "Database error";
        await prisma.importRowLog.create({
          data: {
            importRunId: importRun.id,
            rowNumber,
            discordId,
            steamId,
            rpName,
            grade,
            action: "ERROR",
            message,
          },
        });
        errorSummaries.push({ row: rowNumber, message });
        errorCount++;
      }
    }

    // Update run summary
    await prisma.importRun.update({
      where: { id: importRun.id },
      data: {
        insertedCount,
        updatedCount,
        skippedCount,
        errorCount,
        errors: errorSummaries.length > 0 ? errorSummaries : undefined,
      },
    });

    return NextResponse.json({
      ok: true,
      importRunId: importRun.id,
      summary: {
        totalRows: rows.length,
        insertedCount,
        updatedCount,
        skippedCount,
        errorCount,
      },
      logs,
    });
  } catch (error: any) {
    console.error("[/api/staff/import/members POST]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Import failed" },
      { status: 500 }
    );
  }
}
