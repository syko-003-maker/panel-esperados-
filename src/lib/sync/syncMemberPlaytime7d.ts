import { prisma } from "@/lib/db";
import { resolveFamilyId } from "@/lib/family";
import { fetchFamilyPlaytimes7d } from "@/lib/lyg/fetchFamilyPlaytimes7d";

export type SyncPlaytime7dResult = {
  fetched: number;
  scanned: number;
  updated: number;
  resetToZero: number;
  skippedWithoutSteamId: number;
  unchanged: number;
  missingFromSnapshot: number;
};

export async function syncMemberPlaytime7d(input: {
  familyId: string;
  token: string;
}): Promise<SyncPlaytime7dResult> {
  const t0 = Date.now();
  const familyDbId = await resolveFamilyId(input.familyId);

  const [rows, members] = await Promise.all([
    fetchFamilyPlaytimes7d(input.token, { timeoutMs: 30_000 }),
    prisma.member.findMany({
      where: { familyId: familyDbId },
      select: { id: true, steamId: true, playtime7d: true },
    }),
  ]);
  const snapshotEntries = Array.isArray(rows)
    ? rows
        .map((row) => [String(row?.steamId ?? "").trim(), row?.playtime7d] as const)
        .filter(
          ([steamId, value]) => Boolean(steamId) && typeof value === "number" && Number.isFinite(value)
        )
    : [];

  // ⚠️ RÈGLE MÉTIER : garde contre snapshot LYG vide
  //
  // Un snapshot vide (0 entrées) ne signifie PAS que personne n'a joué cette semaine.
  // Cela indique presque toujours une défaillance technique côté LYG (timeout, token inv.,
  // format inattendu, endpoint en erreur). Si l'on continuait, on marquerait TOUS les membres
  // comme absents du snapshot, ce qui déclencherait un reset massif à 0 — faux positif total.
  //
  // Règle : on n'applique jamais de reset à 0 sans un snapshot exploitable (rows.length > 0).
  // Comportement volontaire et sécurisé : abort, log, retour propre sans toucher la DB.
  if (snapshotEntries.length === 0) {
    console.log("[playtime7d] Empty snapshot from LYG — aborting sync to protect weekly data", {
      family: input.familyId,
      dbMembers: members.length,
      reason: "empty_snapshot_guard",
    });
    return {
      fetched: 0,
      scanned: members.length,
      updated: 0,
      resetToZero: 0,
      skippedWithoutSteamId: 0,
      unchanged: 0,
      missingFromSnapshot: 0,
    };
  }

  console.log("[playtime7d] sync start", {
    family: input.familyId,
    snapshotSize: snapshotEntries.length,
    dbMembers: members.length,
  });

  const bySteam = new Map(snapshotEntries);
  const now = new Date();

  let updated = 0;
  let resetToZero = 0;
  let skippedWithoutSteamId = 0;
  let unchanged = 0;
  let missingFromSnapshot = 0;

  for (const member of members) {
    if (!member.steamId) {
      skippedWithoutSteamId += 1;
      continue;
    }

    if (!bySteam.has(member.steamId)) {
      missingFromSnapshot += 1;
      const currentPlaytime = typeof member.playtime7d === "number" ? member.playtime7d : 0;

      if (currentPlaytime === 0) {
        await prisma.member.update({
          where: { id: member.id },
          data: { playtime7dUpdatedAt: now },
        });
        unchanged += 1;
        continue;
      }

      // Member absent from this week's LYG snapshot: reset weekly playtime to 0
      await prisma.member.update({
        where: { id: member.id },
        data: { playtime7d: 0, playtime7dUpdatedAt: now },
      });
      resetToZero += 1;
      updated += 1;
      continue;
    }

    const nextPlaytime = bySteam.get(member.steamId) ?? 0;

    if (member.playtime7d === nextPlaytime) {
      await prisma.member.update({
        where: { id: member.id },
        data: { playtime7dUpdatedAt: now },
      });
      unchanged += 1;
      continue;
    }

    await prisma.member.update({
      where: { id: member.id },
      data: { playtime7d: nextPlaytime, playtime7dUpdatedAt: now },
    });
    updated += 1;
  }

  const result: SyncPlaytime7dResult = {
    fetched: snapshotEntries.length,
    scanned: members.length,
    updated,
    resetToZero,
    skippedWithoutSteamId,
    unchanged,
    missingFromSnapshot,
  };

  console.log("[playtime7d] sync complete", {
    elapsedMs: Date.now() - t0,
    ...result,
  });

  return result;
}
