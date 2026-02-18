import { NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { headers } from "next/headers";
import { getInternalBaseUrl } from "@/lib/url";

export async function POST(req: Request) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const familyId = "esperados";

  // Call the proxy but forward auth cookies so it can pass requirePrivileged.
  const h = await headers();
  const requestUrl = new URL(req.url);
  const baseUrl = getInternalBaseUrl(requestUrl);
  const proxyUrl = new URL("/api/lyg/infos", baseUrl);
  const cookie = h.get("cookie");

  const res = await fetch(proxyUrl, {
    cache: "no-store",
    headers: cookie ? { cookie } : undefined,
  });

  const txt = await res.text();
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: `Proxy /api/lyg/infos failed: ${res.status}`, body: txt },
      { status: res.status }
    );
  }

  let json: any = null;
  try {
    json = txt ? JSON.parse(txt) : null;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid proxy JSON", body: txt }, { status: 500 });
  }

  const data = json?.data ?? json;
  if (!data) {
    return NextResponse.json({ ok: false, error: "Unexpected infos payload" }, { status: 500 });
  }

  const money = typeof data.money === "number" ? Math.trunc(data.money) : null;
  const points = typeof data.points === "number" ? data.points : null;
  const syncedAt = new Date();

  const row = await prisma.family.upsert({
    where: { slug: familyId },
    update: {
      name: data.name ?? null,
    },
    create: {
      slug: familyId,
      name: data.name ?? null,
    },
    select: { id: true, name: true, slug: true },
  });

  await prisma.syncState.upsert({
    where: { key: `infos:${familyId}` },
    update: { syncedAt, meta: { name: row.name, money, points } },
    create: { key: `infos:${familyId}`, syncedAt, meta: { name: row.name, money, points } },
  });

  return NextResponse.json({
    ok: true,
    family: {
      id: row.id,
      name: row.name,
      money,
      points,
      infoSyncedAt: syncedAt,
    },
  });
}
