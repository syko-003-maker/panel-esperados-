import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";
import { resolveMemberGradeRoleId } from "@/lib/grade-colors";
import { lygFamilyRankUp } from "@/lib/lyg/family-admin";
import { logInfo, logError } from "@/lib/obs";

const SUBTENIENTE_ROLE_ID = "1312845999366209679";
const TARGET_WL = 3;
const MAX_STEPS = 4; // garde-fou (5 → 4 → 3 = 2 pas max en pratique)

export type WlReconcileResult = {
  ok: true;
  checked: number;
  upgraded: Array<{ rpName: string; from: number; to: number }>;
  skipped: number;
  errors: Array<{ rpName: string; error: string }>;
};

/**
 * Réconciliateur : tout membre Subteniente dont la WL est PIRE que 3 (classe 4/5)
 * est remonté en WL3 EN DIRECT sur LYG (via family-admin). Ne rétrograde jamais
 * quelqu'un déjà en WL1/2/3. Couvre aussi les promotions faites à la main sur
 * Discord (on lit le grade LIVE via les rôles miroir, pas seulement le champ
 * stocké qui peut être en retard). Choix user (2026-07-19) : application live +
 * auto-continu.
 *
 * Idempotent : n'agit que sur un vrai écart. Après un up réussi on met wlClass=3
 * en base ; la sync LYG confirmera (ou corrigera si l'écriture n'a pas pris).
 */
export async function reconcileSubtenienteWL3(opts?: { dryRun?: boolean }): Promise<WlReconcileResult> {
  const familyId = await resolveFamilyId(DEFAULT_FAMILY_ID);

  const members = await prisma.member.findMany({
    where: { familyId, isActive: true, isGhost: false, steamId: { not: null } },
    select: { id: true, rpName: true, steamId: true, wlClass: true, grade: true, discordRoleIds: true },
  });

  const upgraded: WlReconcileResult["upgraded"] = [];
  const errors: WlReconcileResult["errors"] = [];
  let checked = 0;
  let skipped = 0;

  for (const m of members) {
    // Grade Subteniente ? On privilégie le rôle Discord LIVE (miroir), avec
    // repli sur le champ stocké si les rôles ne sont pas connus.
    const liveGradeRoleId = resolveMemberGradeRoleId((m.discordRoleIds as string[]) ?? []);
    const isSubteniente =
      liveGradeRoleId === SUBTENIENTE_ROLE_ID || (liveGradeRoleId == null && m.grade === "Subteniente");
    if (!isSubteniente) continue;

    checked++;
    const wl = m.wlClass;
    // wlClass inconnu (null) ou déjà ≤ 3 (WL3 ou mieux) → rien à faire.
    if (typeof wl !== "number" || wl <= TARGET_WL) {
      skipped++;
      continue;
    }
    if (!m.steamId) {
      skipped++;
      continue;
    }

    if (opts?.dryRun) {
      upgraded.push({ rpName: m.rpName ?? "?", from: wl, to: TARGET_WL });
      continue;
    }

    // Remonter classe par classe jusqu'à 3 (ex. 4 → 3 = 1 pas ; 5 → 3 = 2 pas).
    let cur = wl;
    let failed = false;
    for (let step = 0; cur > TARGET_WL && step < MAX_STEPS; step++) {
      const res = await lygFamilyRankUp(m.steamId, cur);
      if (!res.ok) {
        errors.push({ rpName: m.rpName ?? "?", error: res.error ?? "échec LYG" });
        failed = true;
        break;
      }
      cur -= 1;
    }
    if (failed) continue;

    await prisma.member
      .update({ where: { id: m.id }, data: { wlClass: TARGET_WL, wlClassIntent: TARGET_WL } })
      .catch(() => {});
    upgraded.push({ rpName: m.rpName ?? "?", from: wl, to: TARGET_WL });
    logInfo("wl_reconcile_upgraded", { rpName: m.rpName, steamId: m.steamId, from: wl, to: TARGET_WL });
  }

  if (upgraded.length || errors.length) {
    logInfo("wl_reconcile_done", { checked, upgraded: upgraded.length, skipped, errors: errors.length });
  }
  if (errors.length) {
    logError("wl_reconcile_errors", { errors });
  }

  return { ok: true, checked, upgraded, skipped, errors };
}
