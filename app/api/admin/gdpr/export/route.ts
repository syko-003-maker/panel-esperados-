import { NextRequest, NextResponse } from "next/server";
import { requireChef } from "@/lib/guards";
import { exportGdprData } from "@/lib/gdpr";

/**
 * GET /api/admin/gdpr/export
 * Export all data for a member (GDPR right to access)
 */
export async function GET(req: NextRequest) {
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  const searchParams = req.nextUrl.searchParams;
  const memberDiscordId = searchParams.get("memberDiscordId");

  if (!memberDiscordId) {
    return NextResponse.json(
      { ok: false, error: "Missing memberDiscordId query parameter" },
      { status: 400 }
    );
  }

  try {
    const result = await exportGdprData(memberDiscordId);

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      memberDiscordId,
      exportedAt: new Date().toISOString(),
      data: result.data,
    });
  } catch (error: any) {
    console.error("[/api/admin/gdpr/export GET]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Export failed" },
      { status: 500 }
    );
  }
}
