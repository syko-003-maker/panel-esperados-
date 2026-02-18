import { NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { lygFetch } from "@/lib/lyg";
import { FAMILY_SLUG, DEFAULT_FAMILY_ID } from "@/lib/family";

type FamilyInfo = {
  id: string;
  name: string | null;
  money: number | null;
  points: number | null;
  infoSyncedAt: Date | null;
};

async function fetchInfos() {
  // CRITICAL: Always use FAMILY_SLUG, never parameter
  console.log("[family-infos] Fetching family info from LYG", { slug: FAMILY_SLUG });
  return await lygFetch<any>(`/familles/${FAMILY_SLUG}/infos`, { noStore: true });
}

export async function GET(req: Request) {
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

    const payload = await fetchInfos();
    const data = payload?.data ?? payload;
    if (!data) throw new Error("Unexpected infos response");

    const infoSynced = await prisma.syncState.findUnique({
      where: { key: `infos:${FAMILY_SLUG}` },
      select: { syncedAt: true },
    });

    const family: FamilyInfo = {
      id: String(data.id ?? FAMILY_SLUG),
      name: data.name != null ? String(data.name) : null,
      money: typeof data.money === "number" ? Math.trunc(data.money) : null,
      points: typeof data.points === "number" ? data.points : null,
      infoSyncedAt: infoSynced?.syncedAt ?? null,
    };

    return NextResponse.json({ ok: true, family });
  } catch (e: any) {
    console.error("[family-infos] ERROR", String(e?.message ?? e));
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
