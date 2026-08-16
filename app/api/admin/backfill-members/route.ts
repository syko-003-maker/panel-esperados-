import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID } from "@/lib/family";
import { getGradeLevel } from "@/lib/import-validation";
import { toFamilyCuid } from "@/lib/family";

const DEFAULT_GRADE = "WL4";

/**
 * POST /api/admin/backfill-members
 * Scan recruitments, complaints, and other sources to create missing MemberProfile entries
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof Response) return guard;

  const session = guard.session as any;
  const userId = session?.userId ?? session?.user?.id ?? null;
  const familyId = await toFamilyCuid(req.nextUrl.searchParams.get("familyId") ?? DEFAULT_FAMILY_ID);

  const results = {
    scanned: {
      recruitments: 0,
      complaints: 0,
      linkedMembers: 0,
    },
    created: [] as Array<{ discordId: string; source: string; rpName?: string }>,
    skipped: [] as Array<{ discordId: string; reason: string }>,
    errors: [] as Array<{ discordId?: string; error: string; source: string }>,
  };

  try {
    // Create import run for tracking
    const importRun = await prisma.importRun.create({
      data: {
        familyId,
        source: "BACKFILL",
        createdByUserId: userId,
        totalRows: 0,
      },
    });

    // 1. Scan Recruitments
    const recruitments = await prisma.recruitment.findMany({
      where: { familyId },
      select: { discordId: true, rpName: true, steamId: true, age: true },
    });

    results.scanned.recruitments = recruitments.length;

    for (const rec of recruitments) {
      if (!rec.discordId) continue;

      try {
        const existing = await prisma.member.findUnique({
          where: { familyId_discordId: { familyId, discordId: rec.discordId } },
        });

        if (existing) {
          results.skipped.push({ discordId: rec.discordId, reason: "Already exists" });
          continue;
        }

        await prisma.member.create({
          data: {
            familyId,
            discordId: rec.discordId,
            steamId: rec.steamId,
            rpName: rec.rpName,
            age: rec.age,
            grade: DEFAULT_GRADE,
            gradeLevel: getGradeLevel(DEFAULT_GRADE),
            isActive: false, // ✅ Only LYG sync sets isActive=true
            joinedAt: new Date(),
          },
        });

        await prisma.importRowLog.create({
          data: {
            importRunId: importRun.id,
            rowNumber: results.created.length + 1,
            discordId: rec.discordId,
            steamId: rec.steamId,
            rpName: rec.rpName,
            grade: DEFAULT_GRADE,
            action: "INSERT",
            message: "Backfill from recruitment",
          },
        });

        results.created.push({
          discordId: rec.discordId,
          source: "recruitment",
          rpName: rec.rpName ?? undefined,
        });
      } catch (e: any) {
        results.errors.push({
          discordId: rec.discordId,
          error: e.message?.slice(0, 100) ?? "Unknown error",
          source: "recruitment",
        });
      }
    }

    // 2. Scan Complaints
    const complaints = await prisma.complaint.findMany({
      where: { familyId },
      select: { authorDiscordId: true, authorRpName: true },
    });

    results.scanned.complaints = complaints.length;

    for (const comp of complaints) {
      const discordId = comp.authorDiscordId;
      if (!discordId) continue;

      // Skip if already processed
      if (results.created.some((c) => c.discordId === discordId)) continue;
      if (results.skipped.some((s) => s.discordId === discordId)) continue;

      try {
        const existing = await prisma.member.findUnique({
          where: { familyId_discordId: { familyId, discordId } },
        });

        if (existing) {
          results.skipped.push({ discordId, reason: "Already exists" });
          continue;
        }

        await prisma.member.create({
          data: {
            familyId,
            discordId,
            rpName: comp.authorRpName,
            grade: DEFAULT_GRADE,
            gradeLevel: getGradeLevel(DEFAULT_GRADE),
            isActive: false, // ✅ Only LYG sync sets isActive=true
            joinedAt: new Date(),
          },
        });

        await prisma.importRowLog.create({
          data: {
            importRunId: importRun.id,
            rowNumber: results.created.length + 1,
            discordId,
            rpName: comp.authorRpName,
            grade: DEFAULT_GRADE,
            action: "INSERT",
            message: "Backfill from complaint",
          },
        });

        results.created.push({
          discordId,
          source: "complaint",
          rpName: comp.authorRpName ?? undefined,
        });
      } catch (e: any) {
        results.errors.push({
          discordId,
          error: e.message?.slice(0, 100) ?? "Unknown error",
          source: "complaint",
        });
      }
    }

    // 3. Scan Absences (if discordId is set)
    const absences = await prisma.absence.findMany({
      where: { familyId },
      select: { discordId: true },
    });

    for (const abs of absences) {
      if (!abs.discordId) continue;

      // Skip if already processed
      if (results.created.some((c) => c.discordId === abs.discordId)) continue;
      if (results.skipped.some((s) => s.discordId === abs.discordId)) continue;

      try {
        const existing = await prisma.member.findUnique({
          where: { familyId_discordId: { familyId, discordId: abs.discordId } },
        });

        if (existing) {
          results.skipped.push({ discordId: abs.discordId, reason: "Already exists" });
          continue;
        }

        await prisma.member.create({
          data: {
            familyId,
            discordId: abs.discordId,
            grade: DEFAULT_GRADE,
            gradeLevel: getGradeLevel(DEFAULT_GRADE),
            isActive: false, // ✅ Only LYG sync sets isActive=true
            joinedAt: new Date(),
          },
        });

        await prisma.importRowLog.create({
          data: {
            importRunId: importRun.id,
            rowNumber: results.created.length + 1,
            discordId: abs.discordId,
            grade: DEFAULT_GRADE,
            action: "INSERT",
            message: "Backfill from absence",
          },
        });

        results.created.push({ discordId: abs.discordId, source: "absence" });
      } catch (e: any) {
        results.errors.push({
          discordId: abs.discordId,
          error: e.message?.slice(0, 100) ?? "Unknown error",
          source: "absence",
        });
      }
    }

    // 4. Scan Sanctions
    const sanctions = await prisma.sanction.findMany({
      where: { familyId },
      select: { discordId: true },
    });

    for (const sanc of sanctions) {
      if (!sanc.discordId) continue;

      // Skip if already processed
      if (results.created.some((c) => c.discordId === sanc.discordId)) continue;
      if (results.skipped.some((s) => s.discordId === sanc.discordId)) continue;

      try {
        const existing = await prisma.member.findUnique({
          where: { familyId_discordId: { familyId, discordId: sanc.discordId } },
        });

        if (existing) {
          results.skipped.push({ discordId: sanc.discordId, reason: "Already exists" });
          continue;
        }

        await prisma.member.create({
          data: {
            familyId,
            discordId: sanc.discordId,
            grade: DEFAULT_GRADE,
            gradeLevel: getGradeLevel(DEFAULT_GRADE),
            isActive: false, // ✅ Only LYG sync sets isActive=true
            joinedAt: new Date(),
          },
        });

        await prisma.importRowLog.create({
          data: {
            importRunId: importRun.id,
            rowNumber: results.created.length + 1,
            discordId: sanc.discordId,
            grade: DEFAULT_GRADE,
            action: "INSERT",
            message: "Backfill from sanction",
          },
        });

        results.created.push({ discordId: sanc.discordId, source: "sanction" });
      } catch (e: any) {
        results.errors.push({
          discordId: sanc.discordId,
          error: e.message?.slice(0, 100) ?? "Unknown error",
          source: "sanction",
        });
      }
    }

    // Update import run
    await prisma.importRun.update({
      where: { id: importRun.id },
      data: {
        totalRows:
          results.scanned.recruitments +
          results.scanned.complaints +
          results.scanned.linkedMembers,
        insertedCount: results.created.length,
        skippedCount: results.skipped.length,
        errorCount: results.errors.length,
        errors: results.errors.length > 0 ? results.errors : undefined,
      },
    });

    return NextResponse.json({
      ok: true,
      importRunId: importRun.id,
      summary: {
        scanned: results.scanned,
        created: results.created.length,
        skipped: results.skipped.length,
        errors: results.errors.length,
      },
      created: results.created,
      errors: results.errors.length > 0 ? results.errors : undefined,
    });
  } catch (error: any) {
    console.error("[/api/admin/backfill-members]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Backfill failed" },
      { status: 500 }
    );
  }
}
