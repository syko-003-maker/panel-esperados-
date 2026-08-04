import { prisma } from "@/lib/db";
import { resolveFamilyId } from "@/lib/family";
import { fetchFamilyPlaytimes7d, getMinutesSinceWeekStart } from "@/lib/lyg/fetchFamilyPlaytimes7d";

export type SyncPlaytime7dResult = {
  fetched: number;
  scanned: number;
  updated: number;
  resetToZero: number;
  skippedWithoutSteamId: number;
  unchanged: number;
  missingFromSnapshot: number;
  /** Valeurs de la semaine préservées malgré leur absence du snapshot. */
  protectedFromReset: number;
  /** Valeurs préservées parce que LYG renvoyait MOINS que ce qu'on avait déjà. */
  protectedFromDecrease: number;
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
      select: { id: true, steamId: true, playtime7d: true, playtime7dUpdatedAt: true },
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
      protectedFromReset: 0,
      protectedFromDecrease: 0,
    };
  }

  console.log("[playtime7d] sync start", {
    family: input.familyId,
    snapshotSize: snapshotEntries.length,
    dbMembers: members.length,
  });

  const bySteam = new Map(snapshotEntries);
  const now = new Date();

  // ⚠️ GARDE-FOU N°2 : snapshot PARTIEL
  //
  // Le garde ci-dessus ne couvre que le snapshot totalement vide. Un incident
  // LYG partiel (1 entrée sur 231) le franchit sans problème, et tous les
  // absents seraient alors remis à 0 — le playtime de la semaine effacé, juste
  // avant la réunion qui s'appuie dessus.
  //
  // On s'appuie sur une propriété du compteur : il est CUMULÉ depuis lundi
  // 00:00 Bruxelles. Sur une même semaine il ne peut donc que MONTER. Toute
  // baisse intra-semaine est nécessairement un artefact, jamais une donnée.
  //
  // D'où la règle : la valeur déjà enregistrée CETTE semaine fait plancher.
  // Un membre absent du snapshot, ou renvoyé plus bas, conserve son acquis.
  // Au passage du lundi le plancher tombe de lui-même (la valeur stockée date
  // de la semaine précédente), donc la remise à zéro légitime fonctionne
  // toujours — sans avoir à distinguer « panne » et « nouvelle semaine ».
  const weekStartUtc = new Date(now.getTime() - getMinutesSinceWeekStart(now).minutes * 60_000);

  /** Acquis de la semaine en cours ; 0 si la valeur date d'avant lundi. */
  const weekFloor = (m: { playtime7d: number | null; playtime7dUpdatedAt: Date | null }): number => {
    if (!m.playtime7dUpdatedAt || m.playtime7dUpdatedAt < weekStartUtc) return 0;
    return typeof m.playtime7d === "number" && m.playtime7d > 0 ? m.playtime7d : 0;
  };

  let updated = 0;
  let resetToZero = 0;
  let skippedWithoutSteamId = 0;
  let unchanged = 0;
  let missingFromSnapshot = 0;
  let protectedFromReset = 0;
  let protectedFromDecrease = 0;

  for (const member of members) {
    if (!member.steamId) {
      skippedWithoutSteamId += 1;
      continue;
    }

    if (!bySteam.has(member.steamId)) {
      missingFromSnapshot += 1;
      const currentPlaytime = typeof member.playtime7d === "number" ? member.playtime7d : 0;
      const floor = weekFloor(member);

      // Acquis de la semaine : on ne l'efface pas sur une simple absence du
      // snapshot. Avant, cette branche remettait à 0 sans condition.
      if (floor > 0) {
        await prisma.member.update({
          where: { id: member.id },
          data: { playtime7dUpdatedAt: now },
        });
        protectedFromReset += 1;
        unchanged += 1;
        continue;
      }

      if (currentPlaytime === 0) {
        await prisma.member.update({
          where: { id: member.id },
          data: { playtime7dUpdatedAt: now },
        });
        unchanged += 1;
        continue;
      }

      // Valeur héritée de la semaine précédente : la remise à zéro est ici
      // légitime, c'est le nouveau cycle hebdomadaire qui commence.
      await prisma.member.update({
        where: { id: member.id },
        data: { playtime7d: 0, playtime7dUpdatedAt: now },
      });
      resetToZero += 1;
      updated += 1;
      continue;
    }

    const reported = bySteam.get(member.steamId) ?? 0;
    const floor = weekFloor(member);
    // LYG sous ce qu'on a déjà enregistré cette semaine : impossible sur un
    // compteur cumulé — on garde l'acquis.
    const nextPlaytime = Math.max(reported, floor);
    if (nextPlaytime > reported) protectedFromDecrease += 1;

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
    protectedFromReset,
    protectedFromDecrease,
  };

  console.log("[playtime7d] sync complete", {
    elapsedMs: Date.now() - t0,
    ...result,
  });

  // Signal d'alerte : si la protection joue pour beaucoup de monde, c'est que
  // LYG a renvoyé un snapshot partiel. Les données sont saines (rien n'a été
  // écrasé), mais elles ne progressent plus tant que LYG ne répond pas bien.
  if (protectedFromReset + protectedFromDecrease > 0) {
    console.warn("[playtime7d] snapshot partiel détecté — acquis de la semaine préservés", {
      family: input.familyId,
      snapshotSize: snapshotEntries.length,
      protectedFromReset,
      protectedFromDecrease,
    });
  }

  return result;
}
