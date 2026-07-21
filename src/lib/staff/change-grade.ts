import { prisma } from "@/lib/db";
import { enqueueAssignRole, enqueueRemoveRole } from "@/lib/discord/discord";
import { GRADE_LABEL_BY_ROLE_ID, resolveMemberGradeRoleId } from "@/lib/grade-colors";
import { getRankGradeLevel } from "@/lib/discord-rank";
import { ASSIGNABLE_GRADE_ROLE_IDS, CHEF_FAMILLE_ROLE_ID } from "@/lib/staff/grade-options";

const GUILD_ID = process.env.DISCORD_GUILD_ID ?? process.env.GUILD_ID ?? "";

export type ChangeGradeResult =
  | {
      ok: true;
      member: { id: string; rpName: string; discordId: string };
      oldGrade: string | null;
      newGrade: string;
      direction: "promote" | "derank" | "same";
    }
  | { ok: false; error: string; message?: string };

/**
 * Change le GRADE d'un membre vers `targetRoleId` (promotion OU rétrogradation —
 * n'importe quel grade assignable). Même mécanique que la rétrogradation et la
 * finalisation de réunion : update Member + GradeHistory + swap de rôle Discord
 * via l'outbox (le worker applique, la sync LYG ne touche pas rankLabel/rankRoleId
 * → durable). Le rang Discord reste la source de vérité.
 *
 * Utilisé par l'endpoint /api/staff/members/set-grade ET par les scripts.
 */
export async function changeMemberGrade(opts: {
  familyId: string;
  memberId: string;
  targetRoleId: string;
  actor?: { discordId?: string | null; userId?: string | null };
  reason?: string;
}): Promise<ChangeGradeResult> {
  const { familyId, memberId, targetRoleId } = opts;
  const actorDiscordId = opts.actor?.discordId ?? null;
  const actorId = opts.actor?.userId ?? null;
  const reason = (opts.reason ?? "").trim();

  if (!ASSIGNABLE_GRADE_ROLE_IDS.includes(targetRoleId)) {
    return {
      ok: false,
      error: "INVALID_TARGET_GRADE",
      message: "Grade cible inconnu ou non assignable (Chef / Réserviste / Nutella exclus).",
    };
  }

  const member = await prisma.member.findFirst({
    where: { id: memberId, familyId },
    select: {
      id: true,
      rpName: true,
      discordId: true,
      grade: true,
      gradeLevel: true,
      roleDiscordId: true,
      rankRoleId: true,
      rankLabel: true,
      discordRoleIds: true,
    },
  });
  if (!member) return { ok: false, error: "MEMBER_NOT_FOUND" };
  if (!member.discordId) {
    return { ok: false, error: "MEMBER_NO_DISCORD", message: "Ce membre n'a pas de Discord ID." };
  }

  const liveRoleIds = Array.isArray(member.discordRoleIds) ? (member.discordRoleIds as string[]) : [];
  const currentRoleId =
    resolveMemberGradeRoleId(liveRoleIds) ??
    (member.rankRoleId && GRADE_LABEL_BY_ROLE_ID[member.rankRoleId] ? member.rankRoleId : null);

  if (currentRoleId === CHEF_FAMILLE_ROLE_ID) {
    return { ok: false, error: "CANNOT_CHANGE_CHEF", message: "Le Chef famille ne se change pas via cet outil." };
  }
  if (currentRoleId === targetRoleId) {
    return { ok: false, error: "ALREADY_AT_GRADE", message: "Le membre a déjà ce grade." };
  }

  const targetGrade = GRADE_LABEL_BY_ROLE_ID[targetRoleId];
  const currentGrade = currentRoleId
    ? GRADE_LABEL_BY_ROLE_ID[currentRoleId] ?? member.grade ?? null
    : member.grade ?? null;
  const targetGradeLevel = getRankGradeLevel(targetGrade, targetRoleId) || member.gradeLevel;

  const currentIndex = currentRoleId ? ASSIGNABLE_GRADE_ROLE_IDS.indexOf(currentRoleId) : -1;
  const targetIndex = ASSIGNABLE_GRADE_ROLE_IDS.indexOf(targetRoleId);
  const direction: "promote" | "derank" | "same" =
    currentIndex === -1 || currentIndex === targetIndex
      ? "same"
      : targetIndex < currentIndex
      ? "promote"
      : "derank";

  // ── 1. DB : grade + gradeLevel + rôles miroir ─────────────────────────────
  await prisma.member.update({
    where: { id: member.id },
    data: {
      grade: targetGrade,
      gradeLevel: targetGradeLevel,
      roleDiscordId: targetRoleId,
      rankRoleId: targetRoleId,
      rankLabel: targetGrade,
    },
  });

  // ── 2. Historique de grade (trace d'audit) ────────────────────────────────
  await prisma.gradeHistory.create({
    data: {
      memberId: member.id,
      oldGrade: currentGrade,
      oldGradeLevel: member.gradeLevel,
      newGrade: targetGrade,
      newGradeLevel: targetGradeLevel,
      changedBy: actorDiscordId ?? actorId ?? null,
      source: "MANUAL",
      notes: `Changement de grade ${currentGrade ?? "?"} → ${targetGrade}${reason ? ` — ${reason}` : ""}`,
    },
  });

  // ── 3. Discord : attribuer le grade cible + retirer les anciens grades ────
  if (GUILD_ID && member.discordId) {
    await enqueueAssignRole({
      familyId,
      guildId: GUILD_ID,
      userDiscordId: member.discordId,
      roleId: targetRoleId,
      entity: "Member",
      entityId: member.id,
      meta: {
        actorDiscordId,
        actorUserId: actorId,
        // Filet anti "double rang" : le worker retire les autres grades à l'application.
        stripGradeRoleIds: Object.keys(GRADE_LABEL_BY_ROLE_ID),
      },
    });

    const ALL_RANK_ROLE_IDS = new Set(Object.keys(GRADE_LABEL_BY_ROLE_ID));
    const roleIdsToRemove = new Set<string>();
    const legacyOld = member.roleDiscordId ?? member.rankRoleId ?? null;
    if (legacyOld && legacyOld !== targetRoleId && ALL_RANK_ROLE_IDS.has(legacyOld)) {
      roleIdsToRemove.add(legacyOld);
    }
    for (const rid of liveRoleIds) {
      if (rid !== targetRoleId && ALL_RANK_ROLE_IDS.has(rid)) roleIdsToRemove.add(rid);
    }
    for (const rid of roleIdsToRemove) {
      await enqueueRemoveRole({
        familyId,
        guildId: GUILD_ID,
        userDiscordId: member.discordId,
        roleId: rid,
        entity: "Member",
        entityId: member.id,
        meta: { actorDiscordId, actorUserId: actorId },
      });
    }
  }

  return {
    ok: true,
    member: { id: member.id, rpName: member.rpName ?? "Unknown", discordId: member.discordId },
    oldGrade: currentGrade,
    newGrade: targetGrade,
    direction,
  };
}
