import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";
import { getUserDiscordIdFromSession } from "@/server/auth/discord";
import { auditStaffAction } from "@/lib/audit";
import { enqueueAssignRole, enqueueRemoveRole } from "@/lib/discord/discord";
import {
  GRADE_LABEL_BY_ROLE_ID,
  GRADE_ROLE_IDS_ORDERED,
  resolveMemberGradeRoleId,
} from "@/lib/grade-colors";
import { getRankGradeLevel } from "@/lib/discord-rank";
import {
  findRoleIdForGradeLabel,
  normalizeMeetingTargetGrade,
} from "@/lib/staff/meetings/finalize/target-grade";

/**
 * Rétrograder (derank) un membre d'un ou plusieurs grades dans la hiérarchie
 * Discord de la famille (Général → Consejero → … → Soldato → Novato).
 *
 * ⚠️ Rien à voir avec le « Démote » disciplinaire (SanctionType.DEMOTE, qui
 * colle un rôle de punition). Ici on baisse simplement le GRADE : on retire le
 * rôle de grade courant et on attribue le rôle du grade cible, exactement comme
 * une promotion de réunion mais dans l'autre sens. Réutilise la même mécanique
 * (Member update + GradeHistory + outbox ASSIGN_ROLE/REMOVE_ROLE) que
 * app/api/staff/meetings/[id]/finalize/route.ts.
 *
 * Le rang est la SOURCE DE VÉRITÉ Discord (rôles) : le worker applique le swap,
 * et la sync LYG ne touche pas rankLabel/rankRoleId/gradeLevel → durable.
 *
 * Accès : Chef famille + État-Major (requireChefOrEtatMajor). On refuse de
 * rétrograder le Chef famille via cet outil (à faire à la main).
 */

const GUILD_ID = process.env.DISCORD_GUILD_ID ?? process.env.GUILD_ID ?? "";
const CHEF_FAMILLE_ROLE_ID = "1429607761720770623";
const RESERVISTE_ROLE_ID = "1312845999366209682";
const NUTELLA_ROLE_ID = "1465415073425133598";

// Échelle réellement « rétrogradable » : les vrais grades hiérarchiques, du
// plus haut au plus bas. On exclut Réserviste et Nutella qui ne sont pas des
// grades de la hiérarchie (statut réserviste = sanction ; Nutella = amis).
const DERANK_LADDER: string[] = GRADE_ROLE_IDS_ORDERED.filter(
  (id) => id !== RESERVISTE_ROLE_ID && id !== NUTELLA_ROLE_ID,
);

export async function POST(req: Request) {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const session = (guard as any).session;
  const actorId = session?.user?.id ?? session?.userId ?? null;
  const actorName = session?.user?.name ?? null;
  const actorDiscordId = await getUserDiscordIdFromSession(session).catch(() => null);

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    const familyId = await resolveFamilyId(DEFAULT_FAMILY_ID);

    const memberId = body.memberId ? String(body.memberId).trim() : null;
    const memberDiscordId = body.memberDiscordId ? String(body.memberDiscordId).trim() : null;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    const targetGradeRaw = typeof body.targetGrade === "string" ? body.targetGrade.trim() : "";

    if (!memberId && !memberDiscordId) {
      return NextResponse.json({ ok: false, error: "MISSING_MEMBER" }, { status: 400 });
    }

    const member = memberId
      ? await prisma.member.findFirst({
          where: { id: memberId, familyId },
          select: memberSelect,
        })
      : await prisma.member.findUnique({
          where: { familyId_discordId: { familyId, discordId: memberDiscordId! } },
          select: memberSelect,
        });

    if (!member) {
      return NextResponse.json({ ok: false, error: "MEMBER_NOT_FOUND" }, { status: 404 });
    }
    if (!member.discordId) {
      return NextResponse.json(
        { ok: false, error: "MEMBER_NO_DISCORD", message: "Ce membre n'a pas de Discord ID — impossible de changer son grade." },
        { status: 400 },
      );
    }

    // Grade courant : priorité au rôle de grade LIVE (mirror discordRoleIds),
    // sinon le champ rankRoleId. resolveMemberGradeRoleId prend le plus haut.
    const liveRoleIds = Array.isArray(member.discordRoleIds) ? (member.discordRoleIds as string[]) : [];
    const currentRoleId =
      resolveMemberGradeRoleId(liveRoleIds) ??
      (member.rankRoleId && GRADE_LABEL_BY_ROLE_ID[member.rankRoleId] ? member.rankRoleId : null);

    if (!currentRoleId) {
      return NextResponse.json(
        { ok: false, error: "NO_CURRENT_GRADE", message: "Ce membre n'a aucun grade hiérarchique détecté — rien à rétrograder." },
        { status: 400 },
      );
    }
    if (currentRoleId === CHEF_FAMILLE_ROLE_ID) {
      return NextResponse.json(
        { ok: false, error: "CANNOT_DERANK_CHEF", message: "Le Chef famille ne peut pas être rétrogradé via cet outil." },
        { status: 403 },
      );
    }

    const currentIndex = DERANK_LADDER.indexOf(currentRoleId);
    if (currentIndex === -1) {
      return NextResponse.json(
        { ok: false, error: "GRADE_NOT_DERANKABLE", message: "Le grade actuel de ce membre n'est pas rétrogradable (réserviste / statut spécial)." },
        { status: 400 },
      );
    }

    // Cible : soit un grade explicite (doit être STRICTEMENT plus bas), soit un
    // cran en dessous par défaut.
    let targetIndex: number;
    if (targetGradeRaw) {
      const targetLabel = normalizeMeetingTargetGrade(targetGradeRaw);
      const targetRoleId = targetLabel ? findRoleIdForGradeLabel(targetLabel) : null;
      const idx = targetRoleId ? DERANK_LADDER.indexOf(targetRoleId) : -1;
      if (idx === -1) {
        return NextResponse.json(
          { ok: false, error: "INVALID_TARGET_GRADE", message: "Grade cible inconnu ou non rétrogradable." },
          { status: 400 },
        );
      }
      if (idx <= currentIndex) {
        return NextResponse.json(
          { ok: false, error: "TARGET_NOT_LOWER", message: "Le grade cible doit être plus BAS que le grade actuel." },
          { status: 400 },
        );
      }
      targetIndex = idx;
    } else {
      targetIndex = currentIndex + 1;
      if (targetIndex >= DERANK_LADDER.length) {
        return NextResponse.json(
          { ok: false, error: "ALREADY_LOWEST", message: "Ce membre est déjà au grade le plus bas — impossible de rétrograder davantage." },
          { status: 400 },
        );
      }
    }

    const targetRoleId = DERANK_LADDER[targetIndex];
    const targetGrade = GRADE_LABEL_BY_ROLE_ID[targetRoleId];
    const currentGrade = GRADE_LABEL_BY_ROLE_ID[currentRoleId];
    const targetGradeLevel = getRankGradeLevel(targetGrade, targetRoleId) || member.gradeLevel;

    // ── 1. DB : grade + gradeLevel + rôles miroir ──────────────────────────
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

    // ── 2. Historique de grade (trace d'audit du changement) ───────────────
    await prisma.gradeHistory.create({
      data: {
        memberId: member.id,
        oldGrade: currentGrade,
        oldGradeLevel: member.gradeLevel,
        newGrade: targetGrade,
        newGradeLevel: targetGradeLevel,
        changedBy: actorDiscordId ?? actorId ?? null,
        source: "MANUAL",
        notes: `Rétrogradation ${currentGrade} → ${targetGrade}${reason ? ` — ${reason}` : ""}`,
      },
    });

    // ── 3. Discord : attribuer le grade cible + retirer les anciens grades ──
    if (GUILD_ID && targetRoleId && member.discordId) {
      await enqueueAssignRole({
        familyId,
        guildId: GUILD_ID,
        userDiscordId: member.discordId,
        roleId: targetRoleId,
        entity: "Member",
        entityId: member.id,
        meta: {
          actorDiscordId: actorDiscordId ?? null,
          actorUserId: actorId ?? null,
          // Filet anti "double rang" : à l'application, le worker lit les rôles
          // LIVE et retire tous les autres grades (sauf la cible).
          stripGradeRoleIds: Object.keys(GRADE_LABEL_BY_ROLE_ID),
        },
      });

      // Retrait explicite des anciens rôles de grade (belt & suspenders).
      const ALL_RANK_ROLE_IDS = new Set(Object.keys(GRADE_LABEL_BY_ROLE_ID));
      const roleIdsToRemove = new Set<string>();
      const legacyOld = member.roleDiscordId ?? member.rankRoleId ?? null;
      if (legacyOld && legacyOld !== targetRoleId && ALL_RANK_ROLE_IDS.has(legacyOld)) {
        roleIdsToRemove.add(legacyOld);
      }
      for (const rid of liveRoleIds) {
        if (rid !== targetRoleId && ALL_RANK_ROLE_IDS.has(rid)) {
          roleIdsToRemove.add(rid);
        }
      }
      for (const rid of roleIdsToRemove) {
        await enqueueRemoveRole({
          familyId,
          guildId: GUILD_ID,
          userDiscordId: member.discordId,
          roleId: rid,
          entity: "Member",
          entityId: member.id,
          meta: { actorDiscordId: actorDiscordId ?? null, actorUserId: actorId ?? null },
        });
      }
    }

    // Audit best-effort (l'historique de grade reste la trace principale).
    await auditStaffAction(actorId, actorName, "MEMBER_DERANK", "Member", member.id, {
      familyId,
      entityName: member.rpName ?? undefined,
      meta: {
        memberDiscordId: member.discordId,
        oldGrade: currentGrade,
        newGrade: targetGrade,
        reason: reason || null,
      },
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      member: { id: member.id, rpName: member.rpName ?? "Unknown", discordId: member.discordId },
      oldGrade: currentGrade,
      newGrade: targetGrade,
    });
  } catch (err) {
    console.error("[/api/staff/members/derank POST] error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

const memberSelect = {
  id: true,
  rpName: true,
  discordId: true,
  isActive: true,
  isGhost: true,
  grade: true,
  gradeLevel: true,
  roleDiscordId: true,
  rankRoleId: true,
  rankLabel: true,
  discordRoleIds: true,
} as const;
