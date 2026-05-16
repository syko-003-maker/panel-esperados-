import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { fetchLygWarns } from "@/lib/lyg-client";
import { parseLygWarnDate } from "@/lib/lyg/parseLygWarnDate";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const { memberId } = await params;
  if (!memberId) {
    return NextResponse.json({ ok: false, error: "MISSING_MEMBER_ID" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const page  = Number(searchParams.get("page")  ?? 1);
  const limit = Number(searchParams.get("limit") ?? 50);

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { steamId: true },
  });

  if (!member?.steamId) {
    return NextResponse.json({ ok: false, error: "NO_STEAM_ID" }, { status: 404 });
  }

  const res = await fetchLygWarns(member.steamId, { page, limit });
  if (!res.ok || !res.data) {
    return NextResponse.json({ ok: false, error: res.error ?? "LYG_ERROR" }, { status: 502 });
  }

  // Bug API LYG : les dates ont un suffixe Z abusif sur du Brussels local.
  // Sans correction, le profil affiche +1h/+2h par rapport à la réalité.
  // On normalise toutes les dates avant de les renvoyer au client.
  const normalized = {
    ...res.data,
    data: Array.isArray((res.data as any)?.data)
      ? (res.data as any).data.map((w: { date?: string | null }) => {
          const corrected = parseLygWarnDate(w?.date ?? null);
          return corrected ? { ...w, date: corrected.toISOString() } : w;
        })
      : (res.data as any)?.data,
  };

  return NextResponse.json({ ok: true, data: normalized });
}
