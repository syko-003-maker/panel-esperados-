import { NextRequest, NextResponse } from "next/server";
import { requireChef } from "@/lib/guards";
import {
  getAllConfigs,
  getConfigsRaw,
  setConfig,
  deleteConfig,
  getFeatureFlags,
  initializeFeatureFlags,
  clearConfigCache,
  getCacheStats,
  DEFAULT_FEATURE_FLAGS,
  DEFAULT_CONFIGS,
} from "@/lib/config";

/**
 * GET /api/admin/config
 * Get all configurations
 */
export async function GET(req: NextRequest) {
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  const searchParams = req.nextUrl.searchParams;
  const familyId = searchParams.get("familyId") ?? "esperados";
  const raw = searchParams.get("raw") === "true";

  try {
    if (raw) {
      // Return raw DB records
      const configs = await getConfigsRaw(familyId);
      return NextResponse.json({
        ok: true,
        configs: configs.map((c) => ({
          id: c.id,
          key: c.key,
          value: c.value,
          updatedAt: c.updatedAt.toISOString(),
        })),
      });
    }

    // Return merged configs with defaults
    const configs = await getAllConfigs(familyId);
    const flags = await getFeatureFlags(familyId);
    const cacheStats = getCacheStats();

    return NextResponse.json({
      ok: true,
      familyId,
      configs,
      featureFlags: flags,
      defaults: {
        featureFlags: DEFAULT_FEATURE_FLAGS,
        configs: DEFAULT_CONFIGS,
      },
      cache: cacheStats,
    });
  } catch (error: any) {
    console.error("[/api/admin/config GET]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to fetch configs" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/config
 * Set a configuration value
 */
export async function POST(req: NextRequest) {
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
    }

    const familyId = String(body.familyId ?? "esperados").trim();
    const key = String(body.key ?? "").trim();
    const value = body.value;

    if (!key) {
      return NextResponse.json({ ok: false, error: "Missing key" }, { status: 400 });
    }

    if (value === undefined) {
      return NextResponse.json({ ok: false, error: "Missing value" }, { status: 400 });
    }

    await setConfig(key, value, familyId);

    return NextResponse.json({
      ok: true,
      message: `Config ${key} updated`,
      key,
      value,
    });
  } catch (error: any) {
    console.error("[/api/admin/config POST]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to set config" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/config
 * Delete a configuration (reset to default)
 */
export async function DELETE(req: NextRequest) {
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
    }

    const familyId = String(body.familyId ?? "esperados").trim();
    const key = String(body.key ?? "").trim();

    if (!key) {
      return NextResponse.json({ ok: false, error: "Missing key" }, { status: 400 });
    }

    await deleteConfig(key, familyId);

    return NextResponse.json({
      ok: true,
      message: `Config ${key} deleted (will use default)`,
      key,
    });
  } catch (error: any) {
    console.error("[/api/admin/config DELETE]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to delete config" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/config
 * Special actions: initialize, clear-cache
 */
export async function PUT(req: NextRequest) {
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
    }

    const action = String(body.action ?? "").trim();
    const familyId = String(body.familyId ?? "esperados").trim();

    switch (action) {
      case "initialize":
        await initializeFeatureFlags(familyId);
        return NextResponse.json({
          ok: true,
          message: "Feature flags initialized",
        });

      case "clear-cache":
        clearConfigCache();
        return NextResponse.json({
          ok: true,
          message: "Config cache cleared",
        });

      default:
        return NextResponse.json(
          { ok: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error("[/api/admin/config PUT]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Action failed" },
      { status: 500 }
    );
  }
}
