import { NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { FAMILY_SLUG, DEFAULT_FAMILY_ID } from "@/lib/family";

type FamilyInfo = {
  id: string;
  name: string | null;
  money: number | null;
  points: number | null;
  infoSyncedAt: Date | null;
};

export async function GET(req: Request) {
  console.log(`[DIAG][family/infos] GET ${new Date().toISOString()} url=${req.url}`);
  try {
    const guard = await requirePrivileged();
    if (guard instanceof Response) return guard;

    const { searchParams } = new URL(req.url);
    const familyIdParam = searchParams.get("familyId");
    
    // Log if non-slug parameter received
    if (familyIdParam && familyIdParam !== FAMILY_SLUG && familyIdParam !== DEFAULT_FAMILY_ID) {
      console.warn("[family-infos] Ignoring non-slug familyId parameter", {
        received: familyIdParam,
        enforced: FAMILY_SLUG,
      });
    }

    const [familyRow, infoSynced] = await Promise.all([
      prisma.family.findUnique({
        where: { slug: FAMILY_SLUG },
        select: { id: true, name: true },
      }),
      prisma.syncState.findUnique({
        where: { key: `infos:${FAMILY_SLUG}` },
        select: { syncedAt: true, meta: true },
      }),
    ]);

    const meta = (infoSynced?.meta as any) ?? {};
    const moneyRaw = meta?.money;
    const pointsRaw = meta?.points;

    const money =
      typeof moneyRaw === "number"
        ? Math.trunc(moneyRaw)
        : typeof moneyRaw === "string" && moneyRaw.trim() !== ""
          ? Math.trunc(Number(moneyRaw.replace(/\s+/g, "")))
          : null;

    const points =
      typeof pointsRaw === "number"
        ? Math.trunc(pointsRaw)
        : typeof pointsRaw === "string" && pointsRaw.trim() !== ""
          ? Math.trunc(Number(pointsRaw.replace(/\s+/g, "")))
          : null;

    const familyName =
      typeof meta?.name === "string" && meta.name.trim() !== ""
        ? meta.name
        : (familyRow?.name ?? null);

    const family: FamilyInfo = {
      id: String(familyRow?.id ?? FAMILY_SLUG),
      name: familyName,
      money,
      points,
      infoSyncedAt: infoSynced?.syncedAt ?? null,
    };

    return NextResponse.json({ ok: true, family });
  } catch (e: any) {
    console.error("[family-infos] ERROR", String(e?.message ?? e));
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
