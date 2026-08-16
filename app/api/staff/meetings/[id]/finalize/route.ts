import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireEncadrantOrAbove, isSessionFullWriter } from "@/lib/guards";
import { getSession } from "@/auth";
import { DEFAULT_FAMILY_ID } from "@/lib/family";
import { resolveFamilyId, toFamilyCuid } from "@/lib/family";
import { recordPanelMetric } from "@/lib/metrics";
import { requireMeetingsEnabled } from "@/lib/feature-guard";
import { computeMeetingSummary } from "@/lib/meetings";
import {
  enqueueSanctionApply,
  enqueueAssignRole,
  enqueueRemoveRole,
} from "@/lib/discord/discord";
import { evaluateSanctionRules } from "@/lib/sanction-rules";
import { getSanctionExpirationDate } from "@/lib/sanctions";
import { GRADE_LABEL_BY_ROLE_ID } from "@/lib/grade-colors";
import { capturePreReservistRank } from "@/lib/staff/pre-reservist";
import { getRankGradeLevel } from "@/lib/discord-rank";
import { runMeetingActivityEvaluation } from "@/lib/activity/run-meeting-evaluation";

import {
  resolveMeetingDecisionCode,
  decisionToSanctionType,
  isPromotionDecision,
} from "@/lib/staff/meetings/finalize/decision-codes";
import {
  normalizeMeetingTargetGrade,
  findRoleIdForGradeLabel,
  isProtectedPromotionTargetGrade,
} from "@/lib/staff/meetings/finalize/target-grade";
import {
  findMissingPromotionTargets,
  buildPromotionDecisionMap,
} from "@/lib/staff/meetings/finalize/validate";

/**
 * POST /api/staff/meetings/[id]/finalize
 *
 * Finalise une réunion :
 *   1. Applique les promotions (UP / DOUBLE_UP) → grade member + roles Discord
 *   2. Crée les sanctions (DEMOTE / BLACKLIST / RESERVISTE / AVERT_*) +
 *      enqueue SANCTION_APPLY outbox
 *   3. Retire le rôle "En test" si REMOVE_TEST_RANK
 *   4. Marque le meeting FINAL + audit log + metric
 *
 * Logique métier (Prisma writes + outbox enqueues) GARDÉE INLINE :
 * critique, tout changement = risque. Seules les fonctions PURES sont
 * extraites dans src/lib/staff/meetings/finalize/.
 *
 * Refactor Lot 9 : 684 → ~410 lignes. Aucun changement de comportement.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Feature flag
  const featureCheck = await requireMeetingsEnabled("finalize");
  if (!featureCheck.allowed) {
    console.log("[finalize] feature flag blocked:", featureCheck.response.status);
    return featureCheck.response;
  }

  // Ouvert à l'Encadrant, SAUF si la réunion contient une décision grave
  // (démote / blacklist / exclusion = virer) : dans ce cas seul l'EM+ peut
  // finaliser (le contrôle par-décision est fait plus bas, après chargement).
  const guard = await requireEncadrantOrAbove();
  if (guard instanceof Response) {
    console.log("[finalize] requireEncadrantOrAbove blocked:", guard.status);
    return guard;
  }
  console.log("[finalize] guard passed");

  const session = await getSession();
  const userId = session?.user?.id ?? (session as any)?.userId ?? null;
  const userDiscordId = (session as any)?.discordId ?? (session?.user as any)?.discordId ?? null;

  const { id: meetingId } = await params;
  const meetingMarker = `[meeting:${meetingId}]`;
  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);

  // Charger le meeting + ses rows et decisions
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: { decisions: true, rows: true },
  });

  if (!meeting) {
    return NextResponse.json({ ok: false, error: "Meeting not found" }, { status: 404 });
  }

  // Garde-fou "virer/blacklist" : si une ligne porte une décision grave
  // (démote / blacklist / exclusion), seul l'EM+ peut finaliser (car finalize
  // applique réellement ces sanctions). L'Encadrant peut finaliser une réunion
  // sans décision grave (warns, réserviste, promotions, présence).
  {
    const GRAVE = new Set(["DEMOTE", "BLACKLIST", "EXCLUDE", "EXCLUSION"]);
    const hasGrave = meeting.rows.some((row) => {
      const code = String(resolveMeetingDecisionCode(row) ?? "").toUpperCase();
      return GRAVE.has(code);
    });
    if (hasGrave && !(await isSessionFullWriter())) {
      return NextResponse.json(
        { ok: false, error: "FORBIDDEN_GRAVE_FINALIZE", message: "Cette réunion contient une décision de démote/blacklist/exclusion : seul l'État-Major peut la finaliser." },
        { status: 403 }
      );
    }
  }

  if (meeting.status === "FINAL") {
    return NextResponse.json({
      ok: true,
      alreadyFinal: true,
      message: "Meeting was already finalized",
      finalizedAt: meeting.finalizedAt,
    });
  }

  if (meeting.status !== "CLOSED") {
    return NextResponse.json(
      { ok: false, error: "MEETING_MUST_BE_CLOSED_BEFORE_FINALIZE" },
      { status: 409 }
    );
  }

  const results = {
    promoted: 0,
    applied: 0,
    demoted: 0,
    blacklisted: 0,
    reservists: 0,
    warnings: 0,
    kept: 0,
    errors: [] as Array<{ memberDiscordId: string; error: string }>,
  };

  // ── Validation TARGET_GRADE_REQUIRED ───────────────────────────────
  const promotionDecisionByDiscordId = buildPromotionDecisionMap(meeting.decisions);
  const missingPromotionTargets = findMissingPromotionTargets(
    meeting.rows,
    promotionDecisionByDiscordId
  );

  console.log(
    "[finalize] missingPromotionTargets:",
    missingPromotionTargets.length,
    JSON.stringify(missingPromotionTargets)
  );
  if (missingPromotionTargets.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "TARGET_GRADE_REQUIRED",
        message: "Une cible de rang est requise pour chaque décision Up / Double Up avant finalisation.",
        rows: missingPromotionTargets,
      },
      { status: 409 }
    );
  }

  const GUILD_ID = process.env.DISCORD_GUILD_ID ?? "";
  const EN_TEST_ROLE_ID = "1312845999340781643";

  // ── Main loop : appliquer les décisions row par row ────────────────
  for (const row of meeting.rows) {
    try {
      const rawDecision = resolveMeetingDecisionCode(row);
      const memberDiscordId = String(row.discordIdSnapshot ?? "").trim();

      // ── REMOVE_TEST_RANK ────────────────────────────────────────────
      if (rawDecision === "REMOVE_TEST_RANK") {
        if (GUILD_ID && memberDiscordId) {
          await enqueueRemoveRole({
            familyId: familyDbId,
            guildId: GUILD_ID,
            userDiscordId: memberDiscordId,
            roleId: EN_TEST_ROLE_ID,
            entity: "Meeting",
            entityId: meetingId,
            meta: { actorDiscordId: userDiscordId ?? null, actorUserId: userId ?? null },
          });
        }
        results.kept++;
        continue;
      }

      // ── UP / DOUBLE_UP : promotion ──────────────────────────────────
      if (isPromotionDecision(rawDecision)) {
        const promotionDecision = memberDiscordId
          ? promotionDecisionByDiscordId.get(memberDiscordId)
          : null;
        const targetGrade = normalizeMeetingTargetGrade(promotionDecision?.newGrade ?? null);

        if (!targetGrade) {
          results.errors.push({
            memberDiscordId: memberDiscordId || "unknown",
            error: "TARGET_GRADE_REQUIRED",
          });
          continue;
        }

        // Defense-in-depth : même si une décision a réussi à se glisser
        // avec un grade protégé (manipulation directe DB ou bug futur),
        // on bloque ici. Une promotion Chef famille / Général / Sous-Chef
        // famille / Consejero via une réunion est interdite. Action
        // réservée au Chef famille hors réunion.
        if (isProtectedPromotionTargetGrade(targetGrade)) {
          results.errors.push({
            memberDiscordId: memberDiscordId || "unknown",
            error: `FORBIDDEN_TARGET_GRADE:${targetGrade}`,
          });
          continue;
        }

        const member = await prisma.member.findFirst({
          where: row.memberId
            ? { id: row.memberId, familyId: familyDbId }
            : { familyId: familyDbId, discordId: memberDiscordId || undefined },
        });

        if (!member || !member.discordId) {
          results.errors.push({
            memberDiscordId: memberDiscordId || "unknown",
            error: "Member not found",
          });
          continue;
        }

        const targetRoleId = findRoleIdForGradeLabel(targetGrade);
        const targetGradeLevel =
          getRankGradeLevel(targetGrade, targetRoleId) || member.gradeLevel;

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

        await prisma.gradeHistory.create({
          data: {
            memberId: member.id,
            oldGrade: member.grade,
            oldGradeLevel: member.gradeLevel,
            newGrade: targetGrade,
            newGradeLevel: targetGradeLevel,
            changedBy: userDiscordId ?? userId ?? null,
            source: "MEETING",
            notes: `${meetingMarker} ${rawDecision}`,
          },
        });

        if (row.id) {
          await prisma.meetingRow.update({
            where: { id: row.id },
            data: { gradeSnapshot: targetGrade },
          });
        }

        // Enqueue Discord role changes pour la promotion
        if (GUILD_ID && targetRoleId && member.discordId) {
          await enqueueAssignRole({
            familyId: familyDbId,
            guildId: GUILD_ID,
            userDiscordId: member.discordId,
            roleId: targetRoleId,
            entity: "Meeting",
            entityId: meetingId,
            meta: {
              actorDiscordId: userDiscordId ?? null,
              actorUserId: userId ?? null,
              // Filet de sécurité anti "double rang" : à l'application, le worker
              // lit les rôles LIVE du membre et retire tous les autres grades
              // (sauf la cible). Robuste même si le mirror discordRoleIds était
              // périmé au moment du up (cause du bug constaté sur Tyson).
              stripGradeRoleIds: Object.keys(GRADE_LABEL_BY_ROLE_ID),
            },
          });

          // Collecter les anciens rôles de grade à retirer (priorité
          // discordRoleIds source de vérité Discord + champs legacy DB).
          const ALL_RANK_ROLE_IDS = new Set(Object.keys(GRADE_LABEL_BY_ROLE_ID));
          const roleIdsToRemove = new Set<string>();

          const legacyOld = member.roleDiscordId ?? member.rankRoleId ?? null;
          if (legacyOld && legacyOld !== targetRoleId) {
            roleIdsToRemove.add(legacyOld);
          }

          if (Array.isArray(member.discordRoleIds)) {
            for (const rid of member.discordRoleIds) {
              if (rid !== targetRoleId && ALL_RANK_ROLE_IDS.has(rid)) {
                roleIdsToRemove.add(rid);
              }
            }
          }

          for (const rid of roleIdsToRemove) {
            await enqueueRemoveRole({
              familyId: familyDbId,
              guildId: GUILD_ID,
              userDiscordId: member.discordId,
              roleId: rid,
              entity: "Meeting",
              entityId: meetingId,
              meta: { actorDiscordId: userDiscordId ?? null, actorUserId: userId ?? null },
            });
          }

          // Si "En test" présent → retrait automatique lors d'un UP
          const hasTestRole =
            Array.isArray(member.discordRoleIds) &&
            member.discordRoleIds.includes(EN_TEST_ROLE_ID);
          if (hasTestRole) {
            await enqueueRemoveRole({
              familyId: familyDbId,
              guildId: GUILD_ID,
              userDiscordId: member.discordId,
              roleId: EN_TEST_ROLE_ID,
              entity: "Meeting",
              entityId: meetingId,
              meta: { actorDiscordId: userDiscordId ?? null, actorUserId: userId ?? null },
            });
          }
        }

        results.promoted++;
        continue;
      }

      // ── Sanctions (DEMOTE / BLACKLIST / RESERVISTE / AVERT_*) ───────
      // EXCLUDE / EXCLUSION → BLACKLIST (cf decisionToSanctionType).
      const sanctionType = decisionToSanctionType(rawDecision);

      if (!sanctionType) {
        // Décision non sanctionnable (MAINTAIN, WEEK_*, etc.) — on n'enqueue rien
        results.kept++;
        continue;
      }

      const member = await prisma.member.findFirst({
        where: row.memberId
          ? { id: row.memberId, familyId: familyDbId }
          : { familyId: familyDbId, discordId: memberDiscordId || undefined },
      });

      if (!member || !member.discordId) {
        results.errors.push({
          memberDiscordId: memberDiscordId || "unknown",
          error: "Member not found",
        });
        continue;
      }

      // Dernier rang avant réserviste : mémoriser le grade actuel (le rôle de
      // grade sera retiré par le rolePlan) pour pouvoir le restaurer au retour.
      if (sanctionType === "RESERVISTE") {
        await capturePreReservistRank(member);
      }

      const existing = await prisma.sanction.findFirst({
        where: {
          familyId: familyDbId,
          memberId: member.id,
          type: sanctionType,
          source: "MEETING",
          notes: { contains: meetingMarker },
        },
        select: { id: true },
      });

      if (!existing) {
        if (!userId) {
          console.error(
            `[finalize] Cannot create sanction for member ${memberDiscordId || member.id}: session user id is null`
          );
          results.errors.push({
            memberDiscordId: memberDiscordId || "unknown",
            error: "SESSION_USER_ID_MISSING",
          });
          continue;
        }

        const startAt = new Date();
        const reason =
          String(row.sanctionReason ?? "").trim() ||
          `Sanction réunion - ${meeting.title ?? meeting.weekKey}`;

        const sanction = await prisma.sanction.create({
          data: {
            familyId: familyDbId,
            memberId: member.id,
            discordId: member.discordId,
            type: sanctionType,
            source: "MEETING",
            reason,
            startAt,
            expiresAt: getSanctionExpirationDate(sanctionType, startAt),
            status: "ACTIVE",
            discordStatus: "PENDING",
            createdById: userId,
            notes: `${meetingMarker} ${meeting.title ?? meeting.weekKey}`,
          },
        });

        const outbox = await enqueueSanctionApply({
          familyId: familyDbId,
          sanctionId: sanction.id,
          discordId: member.discordId,
          memberName: member.rpName ?? "Unknown",
          sanctionType,
          reason,
          durationHours: sanction.expiresAt
            ? Math.max(1, Math.ceil((sanction.expiresAt.getTime() - Date.now()) / (60 * 60 * 1000)))
            : null,
          staffName: session?.user?.name ?? "Système",
          appliedByUserId: userId,
        });

        if (!outbox) {
          console.error(
            `[finalize] Failed to enqueue SANCTION_APPLY for sanction ${sanction.id} (member ${memberDiscordId || member.id}, type ${sanctionType})`
          );
        }

        await prisma.sanction.update({
          where: { id: sanction.id },
          data: { outboxJobId: outbox?.id ?? null } as any,
        });

        await evaluateSanctionRules(member.id, familyDbId).catch((err) => {
          console.error("[POST /api/staff/meetings/[id]/finalize] Error evaluating rules:", err);
        });

        results.applied++;
        if (sanctionType === "DEMOTE") results.demoted++;
        else if (sanctionType === "BLACKLIST") results.blacklisted++;
        else if (sanctionType === "RESERVISTE") results.reservists++;
        else results.warnings++;
      }

      if (row.id) {
        await prisma.meetingRow.update({
          where: { id: row.id },
          data: { sanctionReason: row.sanctionReason ?? null },
        });
      }
    } catch (err: any) {
      results.errors.push({
        memberDiscordId: String(row.discordIdSnapshot ?? "unknown"),
        error: err.message?.slice(0, 100) ?? "Unknown error",
      });
    }
  }

  // ── Marquer les decisions appliquées ────────────────────────────────
  await prisma.meetingDecision.updateMany({
    where: { meetingId, appliedAt: null },
    data: { appliedAt: new Date() },
  });

  // ── Recalcul du summary final ───────────────────────────────────────
  const refreshedRows = await prisma.meetingRow.findMany({
    where: { meetingId },
    orderBy: { sortOrder: "asc" },
  });
  const computedSummary = computeMeetingSummary(refreshedRows, {
    meetingDate: meeting.meetingDate,
    notes: meeting.description,
  });
  const summary = `Réunion finalisée: ${results.promoted} promotion(s), ${results.applied} sanction(s), ${results.demoted} démote(s), ${results.blacklisted} blacklist(s), ${results.reservists} réserviste(s), ${results.kept} maintien(s)`;

  const finalizedMeeting = await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      status: "FINAL",
      closedAt: meeting.closedAt ?? new Date(),
      finalizedAt: new Date(),
      finalizedByUserId: userId,
      sanctionsAppliedAt: new Date(),
      summary,
      summaryText: meeting.summaryText ?? computedSummary.summaryText,
    },
  });

  // ── Audit log ───────────────────────────────────────────────────────
  await prisma.auditLog.create({
    data: {
      // DEFAULT_FAMILY_ID est un SLUG : on le resout avant ecriture.
      familyId: await toFamilyCuid(DEFAULT_FAMILY_ID),
      actorType: "staff",
      actorId: userId,
      actorName: session?.user?.name ?? null,
      action: "FINALIZED",
      entity: "Meeting",
      entityId: meetingId,
      entityName: meeting.title ?? meeting.weekKey,
      meta: {
        promoted: results.promoted,
        applied: results.applied,
        demoted: results.demoted,
        blacklisted: results.blacklisted,
        reservists: results.reservists,
        warnings: results.warnings,
        kept: results.kept,
        errors: results.errors.length,
      },
    },
  });

  // ── Metric ──────────────────────────────────────────────────────────
  recordPanelMetric("meeting.finalize", meetingId, {
    promoted: results.promoted,
    applied: results.applied,
    demoted: results.demoted,
    blacklisted: results.blacklisted,
    reservists: results.reservists,
    warnings: results.warnings,
    kept: results.kept,
    errors: results.errors.length,
  }).catch(() => {});

  // ── Évaluation d'activité ───────────────────────────────────────────
  // Placée ici volontairement : la réunion est FINAL, `finalizedAt` est posé,
  // sanctions et rôles sont traités. L'évaluation lit ces données arrêtées.
  //
  // NON BLOQUANTE : une finalisation crée des sanctions et applique des rôles.
  // Elle ne doit jamais échouer à cause d'un calcul d'activité. En cas
  // d'erreur, la réunion reste simplement non évaluée — `lastEvaluatedMeetingId`
  // n'étant écrit qu'après succès, rien n'est marqué comme terminé à tort.
  //
  // À ce stade : calcul et persistance de l'état métier UNIQUEMENT. Aucun job
  // Outbox, aucun `lastAlerted`, aucun envoi Discord, aucun appel LYG.
  //
  // Hors périmètre assumé : une réunion déjà finalisée dont l'évaluation a
  // échoué n'est PAS reprise automatiquement. Il n'existe pas de mécanisme de
  // rattrapage — à concevoir séparément si le besoin apparaît.
  try {
    const activity = await runMeetingActivityEvaluation({
      meetingId,
      familyId: await toFamilyCuid(DEFAULT_FAMILY_ID),
      actorId: userId,
    });
    if (activity.ok) {
      console.log("[finalize] activite evaluee", {
        meetingId,
        persisted: activity.persisted,
        evaluated: activity.evaluation.evaluated,
        atypical: activity.evaluation.atypical,
        medianMinutes: activity.evaluation.medianMinutes,
        decisions: activity.evaluation.decisions.length,
        // Décisions calculées mais VOLONTAIREMENT non émises à ce stade.
        wouldEmit: activity.evaluation.toEmit.length,
      });
    } else {
      console.warn("[finalize] activite non evaluee", { meetingId, reason: activity.reason });
    }
  } catch (err) {
    console.error("[finalize] evaluation d'activite echouee (finalisation preservee)", {
      meetingId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.json({
    ok: true,
    finalizedAt: finalizedMeeting.finalizedAt,
    summary,
    results: {
      promoted: results.promoted,
      applied: results.applied,
      demoted: results.demoted,
      blacklisted: results.blacklisted,
      reservists: results.reservists,
      warnings: results.warnings,
      kept: results.kept,
      errors: results.errors.length,
    },
    errors: results.errors.length > 0 ? results.errors : undefined,
  });
}
