import { NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { fetchLygBanklogs } from "@/lib/lyg-banklogs";
import { extractArrayFromLygResponse } from "@/lib/lyg-client";
import crypto from "crypto";

function makeFingerprint(it: any) {
  // stable: même log = même fingerprint
  const s = `${it.family_id}|${it.steamid}|${it.type}|${it.money}|${it.date}`;
  return crypto.createHash("sha256").update(s).digest("hex");
}

export async function POST() {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const familyId = "esperados";

  const result = await fetchLygBanklogs(familyId, { timeoutMs: 15_000 });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? "LYG banklogs fetch failed" },
      { status: result.status || 500 }
    );
  }

  const { array: items } = extractArrayFromLygResponse(result.data);
  if (!items || !Array.isArray(items)) {
    return NextResponse.json({ ok: false, error: "Unexpected LYG response (not array)" }, { status: 500 });
  }

  await prisma.family.upsert({
    where: { slug: familyId },
    update: {},
    create: { slug: familyId, name: "Esperados" },
  });

  let imported = 0;

  for (const it of items) {
    const fingerprint = makeFingerprint(it);
    const id = `banklog_${fingerprint}`;

    await prisma.bankLog.upsert({
      where: { fingerprint },
      update: {
        raw: it,
        // si jamais LYG corrige/édite un log, on aligne
        at: new Date(it.date),
        type: Number(it.type),
        money: Number(it.money),
        steamId: String(it.steamid),
        familyId: String(it.family_id ?? familyId),
      },
      create: {
        id,
        fingerprint,
        raw: it,
        at: new Date(it.date),
        type: Number(it.type),
        money: Number(it.money),
        steamId: String(it.steamid),
        familyId: String(it.family_id ?? familyId),
      },
    });

    imported++;
  }

  await prisma.syncState.upsert({
    where: { key: `banklogs:${familyId}` },
    update: { syncedAt: new Date(), meta: { imported } },
    create: { key: `banklogs:${familyId}`, syncedAt: new Date(), meta: { imported } },
  });

  return NextResponse.json({ ok: true, imported });
}
