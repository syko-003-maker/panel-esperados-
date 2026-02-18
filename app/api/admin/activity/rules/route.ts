import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/guards";
import { DEFAULT_FAMILY_ID } from "@/lib/family";
import { initializeDefaultRules, DEFAULT_RULES } from "@/lib/activityEngine";

/**
 * GET /api/admin/activity/rules
 * List all activity rules
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof Response) return guard;

  const familyId = req.nextUrl.searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;

  try {
    // Ensure default rules exist
    await initializeDefaultRules(prisma, familyId);

    const rules = await prisma.activityRule.findMany({
      where: { familyId },
      orderBy: { priority: "asc" },
    });

    return NextResponse.json({
      ok: true,
      rules,
      availableCodes: DEFAULT_RULES.map((r) => ({
        code: r.code,
        name: r.name,
        description: r.description,
        defaultParams: r.params,
      })),
    });
  } catch (error: any) {
    console.error("[/api/admin/activity/rules GET]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to fetch rules" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/activity/rules
 * Create a new activity rule
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof Response) return guard;

  const familyId = req.nextUrl.searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;
  const body = await req.json();

  const { code, name, description, params, isEnabled, priority } = body;

  if (!code || !name) {
    return NextResponse.json(
      { ok: false, error: "code and name are required" },
      { status: 400 }
    );
  }

  try {
    // Check if rule already exists
    const existing = await prisma.activityRule.findUnique({
      where: { familyId_code: { familyId, code } },
    });

    if (existing) {
      return NextResponse.json(
        { ok: false, error: "Rule with this code already exists" },
        { status: 409 }
      );
    }

    const rule = await prisma.activityRule.create({
      data: {
        familyId,
        code,
        name,
        description: description ?? null,
        params: params ?? {},
        isEnabled: isEnabled ?? true,
        priority: priority ?? 0,
      },
    });

    return NextResponse.json({ ok: true, rule });
  } catch (error: any) {
    console.error("[/api/admin/activity/rules POST]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to create rule" },
      { status: 500 }
    );
  }
}
