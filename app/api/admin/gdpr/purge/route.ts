import { NextRequest, NextResponse } from "next/server";
import { requireChef } from "@/lib/guards";
import { getSession } from "@/auth";
import { purgeGdprData, exportGdprData, isGdprPurgeEnabled } from "@/lib/gdpr";

/**
 * POST /api/admin/gdpr/purge
 * Anonymize all data for a member (GDPR right to be forgotten)
 * THIS IS IRREVERSIBLE
 */
export async function POST(req: NextRequest) {
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!isGdprPurgeEnabled()) {
    return NextResponse.json(
      { ok: false, error: "GDPR purge is disabled. Set GDPR_PURGE_ENABLED=true" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
    }

    const memberDiscordId = String(body.memberDiscordId ?? "").trim();
    const confirm = body.confirm === true;

    if (!memberDiscordId) {
      return NextResponse.json(
        { ok: false, error: "Missing memberDiscordId" },
        { status: 400 }
      );
    }

    if (!confirm) {
      return NextResponse.json(
        {
          ok: false,
          error: "Confirmation required. This action is IRREVERSIBLE.",
          requiresConfirmation: true,
          message: `This will permanently anonymize all data for member ${memberDiscordId}. Set confirm=true to proceed.`,
        },
        { status: 400 }
      );
    }

    const result = await purgeGdprData(
      memberDiscordId,
      session.user.id,
      session.user.name ?? "Unknown"
    , true);

    if (!result.success) {
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      warning: "Data has been permanently anonymized. This cannot be undone.",
      anonymizedDiscordId: result.anonymizedDiscordId,
      summary: {
        membersAnonymized: result.membersAnonymized,
        ticketsAnonymized: result.ticketsAnonymized,
        complaintsAnonymized: result.complaintsAnonymized,
        sanctionsAnonymized: result.sanctionsAnonymized,
        auditLogsAnonymized: result.auditLogsAnonymized,
      },
    });
  } catch (error: any) {
    console.error("[/api/admin/gdpr/purge POST]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "GDPR purge failed" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/gdpr/purge
 * Get GDPR purge status
 */
export async function GET(req: NextRequest) {
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  return NextResponse.json({
    ok: true,
    enabled: isGdprPurgeEnabled(),
    message: isGdprPurgeEnabled()
      ? "GDPR purge is enabled. Use POST with memberDiscordId and confirm=true to purge data."
      : "GDPR purge is disabled. Set GDPR_PURGE_ENABLED=true to enable.",
  });
}
