import { NextRequest, NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/guards";
import { prisma } from "@/lib/db";

/**
 * GET /api/staff/import/members/[importRunId]
 * Get import run details with row logs
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ importRunId: string }> }
) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const { importRunId } = await params;

  try {
    const importRun = await prisma.importRun.findUnique({
      where: { id: importRunId },
      include: {
        rows: {
          orderBy: { rowNumber: "asc" },
        },
      },
    });

    if (!importRun) {
      return NextResponse.json({ ok: false, error: "Import run not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, importRun });
  } catch (error) {
    console.error(`[/api/staff/import/members/${importRunId} GET]`, error);
    return NextResponse.json(
      { ok: false, error: "Failed to fetch import run" },
      { status: 500 }
    );
  }
}
