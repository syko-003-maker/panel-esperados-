export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { getMemberScopeOrNull } from "@/server/member/scope";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";

const FAMILY_ID = DEFAULT_FAMILY_ID;

function parsePageParams(searchParams: URLSearchParams) {
  const pageRaw = Number(searchParams.get("page") ?? "1");
  const pageSizeRaw = Number(searchParams.get("pageSize") ?? "20");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const pageSize = Math.min(Math.max(Number.isFinite(pageSizeRaw) ? pageSizeRaw : 20, 1), 100);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const scope = await getMemberScopeOrNull(session);
  if (!scope) {
    return NextResponse.json(
      { ok: false, code: "MEMBER_NOT_LINKED" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const { steamId } = scope;

  const { page, pageSize, skip } = parsePageParams(searchParams);

  const familyDbId = await resolveFamilyId(FAMILY_ID);
  const where = { familyId: familyDbId, steamId: steamId ?? "" };
  const [data, total] = await Promise.all([
    prisma.bankLog.findMany({
      where,
      orderBy: { at: "desc" },
      skip,
      take: pageSize,
      select: {
        at: true,
        type: true,
        money: true,
        steamId: true,
      },
    }),
    prisma.bankLog.count({ where }),
  ]);

  return NextResponse.json({ ok: true, data, page, pageSize, total });
}
