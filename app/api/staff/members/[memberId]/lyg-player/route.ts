import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { fetchLygPlayer } from "@/lib/lyg-client";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const { memberId } = await params;
  if (!memberId) {
    return NextResponse.json({ ok: false, error: "MISSING_MEMBER_ID" }, { status: 400 });
  }

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    select: { steamId: true },
  });

  if (!member?.steamId) {
    return NextResponse.json({ ok: false, error: "NO_STEAM_ID" }, { status: 404 });
  }

  const res = await fetchLygPlayer(member.steamId);
  if (!res.ok || !res.data) {
    return NextResponse.json({ ok: false, error: res.error ?? "LYG_ERROR" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, data: res.data });
}
