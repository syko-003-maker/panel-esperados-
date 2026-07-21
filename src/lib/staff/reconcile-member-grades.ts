import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";
import { GRADE_LABEL_BY_ROLE_ID, resolveMemberGradeRoleId } from "@/lib/grade-colors";
import { getRankGradeLevel } from "@/lib/discord-rank";
import { BLACKLIST_ROLE_ID, RESERVIST_ROLE_ID } from "@/lib/discord-grade";
import { logInfo, logError } from "@/lib/obs";

export type GradeReconcileResult = {
  ok: true;
  checked: number;
  synced: Array<{ rpName: string; from: string | null; to: string }>;
  skipped: number;
};

/**
 * Réconciliateur : aligne le champ grade STOCKÉ (`grade`/`rankLabel`/`rankRoleId`/
 * `roleDiscordId`/`gradeLevel`) sur le **rôle de grade Discord LIVE** du membre.
 *
 * Pourquoi : rien ne resynchronise ces champs quand un rôle de grade change sur
 * Discord SANS passer par le panel (promotion manuelle, ré-recrutement d'un
 * réserviste…). Le champ reste en retard → tri/snapshots faux ET le membre peut
 * être masqué (ex. champ resté « Réserviste » → `isReservist=true` via statusHints).
 *
 * Aucune écriture Discord/LYG : on ne fait QUE recopier l'état Discord déjà en
 * place dans la base. Idempotent (n'agit que sur un écart).
 *
 * ⚠️ On SAUTE les membres qui ont encore le rôle Réserviste/Blacklist en LIVE
 * (statut spécial en cours — on ne veut pas écraser leur grade), et ceux sans
 * rôle de grade détecté.
 */
export async function reconcileMemberGrades(opts?: { dryRun?: boolean }): Promise<GradeReconcileResult> {
  const familyId = await resolveFamilyId(DEFAULT_FAMILY_ID);

  const members = await prisma.member.findMany({
    where: { familyId, isActive: true, isGhost: false, discordInGuild: true },
    select: { id: true, rpName: true, grade: true, gradeLevel: true, rankRoleId: true, discordRoleIds: true },
  });

  const synced: GradeReconcileResult["synced"] = [];
  let checked = 0;
  let skipped = 0;

  for (const m of members) {
    const roles = (m.discordRoleIds as string[]) ?? [];

    // Statut spécial encore actif sur Discord → ne pas toucher le grade.
    if (roles.includes(RESERVIST_ROLE_ID) || roles.includes(BLACKLIST_ROLE_ID)) {
      skipped++;
      continue;
    }

    const liveRoleId = resolveMemberGradeRoleId(roles);
    if (!liveRoleId) {
      skipped++;
      continue; // aucun rôle de grade détecté → on ne devine pas
    }

    checked++;
    const liveGrade = GRADE_LABEL_BY_ROLE_ID[liveRoleId];
    if (!liveGrade) {
      skipped++;
      continue;
    }

    // Déjà synchro ?
    if (m.grade === liveGrade && m.rankRoleId === liveRoleId) {
      skipped++;
      continue;
    }

    if (opts?.dryRun) {
      synced.push({ rpName: m.rpName ?? "?", from: m.grade ?? null, to: liveGrade });
      continue;
    }

    const level = getRankGradeLevel(liveGrade, liveRoleId) || m.gradeLevel;

    await prisma.member.update({
      where: { id: m.id },
      data: {
        grade: liveGrade,
        rankLabel: liveGrade,
        rankRoleId: liveRoleId,
        roleDiscordId: liveRoleId,
        gradeLevel: level,
      },
    });
    await prisma.gradeHistory
      .create({
        data: {
          memberId: m.id,
          oldGrade: m.grade,
          oldGradeLevel: m.gradeLevel,
          newGrade: liveGrade,
          newGradeLevel: level,
          source: "MANUAL",
          notes: "Sync auto du grade depuis le rôle Discord (champ stocké en retard)",
        },
      })
      .catch(() => {});

    synced.push({ rpName: m.rpName ?? "?", from: m.grade ?? null, to: liveGrade });
    logInfo("grade_reconcile_synced", { rpName: m.rpName, from: m.grade, to: liveGrade, level });
  }

  if (synced.length) {
    logInfo("grade_reconcile_done", { checked, synced: synced.length, skipped });
  }
  return { ok: true, checked, synced, skipped };
}
