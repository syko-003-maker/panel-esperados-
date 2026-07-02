import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendPushToDiscordIds } from "@/lib/push";
import { requireRecruiterOrAbove } from "@/lib/guards";
import { getSession } from "@/auth";
import { enqueueAssignRole, enqueueRemoveRole, enqueueRecruitmentDecision, enqueueMemberDm } from "@/lib/discord/discord";
import { DEMOTE_ROLE_ID } from "@/lib/discord-rbac";
import { BLACKLIST_ROLE_ID, RESERVIST_ROLE_ID } from "@/lib/discord-grade";
import { GRADE_ROLE_IDS_ORDERED } from "@/lib/grade-colors";
import { extractRecruitmentEvaluation, parseRecruitmentNotes } from "@/lib/recruitment/legacy";
import { computeRecruitmentTotals } from "@/lib/recruitment/scoring";
import { logInfo, logWarn, logError, makeRequestId } from "@/lib/obs";
import { lygFamilyAdd } from "@/lib/lyg/family-admin";
import { BLOCKING_SANCTION_TYPES } from "@/lib/sanctions";
import { createAuditLog } from "@/lib/audit";

const DECISIONS = ["ACCEPT", "REJECT"] as const;
const FAMILY_ID = process.env.FAMILY_ID ?? "esperados";
const GUILD_ID = process.env.GUILD_ID ?? "1312845998753710151";

// Rôles attribués automatiquement lors de l'acceptation d'un recrutement
const RECRUITMENT_ACCEPT_ROLE_IDS = [
  "1408492476351778836", // Novato
  "1312845999340781643", // En Test
  "1312845999340781646", // Los Esperados
  "1408484776708673686", // Homme de rang
  "1325929087079813232", // Sans spé
] as const;

// Rôles retirés à l'acceptation s'ils sont présents sur le membre. Cas typique :
// ré-recrutement d'un ancien démote / réserviste / blacklist, OU un ancien grade
// Famille à nettoyer avant d'attribuer Novato. Sans ça, le membre conserve le
// rôle et reste classé "démoté/réserviste/<grade>" par le scope → il N'APPARAÎT
// PAS (ou au mauvais grade) dans la liste, alors qu'il a bien sa WL.
// (Parité avec la commande Discord /decide.)
const NOVATO_ROLE_ID = "1408492476351778836";
const RECRUITMENT_REMOVE_ROLE_IDS = new Set<string>([
  DEMOTE_ROLE_ID,
  BLACKLIST_ROLE_ID,
  RESERVIST_ROLE_ID,
  // Tous les anciens rôles de grade Famille (sauf Novato + les rôles attribués).
  ...GRADE_ROLE_IDS_ORDERED.filter(
    (rid) =>
      rid !== NOVATO_ROLE_ID &&
      !(RECRUITMENT_ACCEPT_ROLE_IDS as readonly string[]).includes(rid)
  ),
]);

type Decision = (typeof DECISIONS)[number];

function isValidDecision(value: string) {
  return DECISIONS.includes(value as Decision);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestId = makeRequestId();

  const guard = await requireRecruiterOrAbove();
  if (guard instanceof Response) return guard;

  const session = await getSession();
  const userId = session?.user?.id ?? (session as any)?.userId;
  const isChef = Boolean(session?.user?.isChef ?? (session as any)?.isChef);
  if (!userId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const decisionRaw = String((body as any).decision ?? "").trim().toUpperCase();
  if (!isValidDecision(decisionRaw)) {
    return NextResponse.json({ ok: false, error: "INVALID_DECISION" }, { status: 400 });
  }

  const recruitment = await prisma.recruitment.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      rpName: true,
      age: true,
      steamId: true,
      discordId: true,
      discordThreadId: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!recruitment) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  if (recruitment.status === "ACCEPTED" || recruitment.status === "REJECTED") {
    logWarn("recruitment_decide_already_closed", { requestId, recruitmentId: id, status: recruitment.status });
    return NextResponse.json({ ok: false, error: "ALREADY_CLOSED" }, { status: 409 });
  }

  // SteamID is only required for ACCEPT (whitelist validation)
  // Fallback: si Recruitment.steamId est vide, tenter de le récupérer depuis le Member lié
  let steamId = (recruitment.steamId ?? "").trim();
  if (decisionRaw === "ACCEPT" && !steamId && recruitment.discordId) {
    const linkedMember = await prisma.member.findFirst({
      where: { discordId: recruitment.discordId },
      select: { steamId: true },
    });
    if (linkedMember?.steamId?.trim()) {
      steamId = linkedMember.steamId.trim();
      logInfo("recruitment_decide_steamid_fallback", { requestId, recruitmentId: id, discordId: recruitment.discordId });
    }
  }
  if (decisionRaw === "ACCEPT" && !steamId) {
    logWarn("recruitment_decide_missing_steamid", { requestId, recruitmentId: id });
    return NextResponse.json({ ok: false, error: "INVALID_STEAM_ID" }, { status: 400 });
  }

  const notes = parseRecruitmentNotes(recruitment.notes ?? null);
  const isClaimedByUser = notes.claimedById === userId;
  if (notes.claimedById && !isClaimedByUser && !isChef) {
    return NextResponse.json({ ok: false, error: "NOT_CLAIMED_BY_USER" }, { status: 403 });
  }

  const nextStatus = decisionRaw === "ACCEPT" ? "ACCEPTED" : "REJECTED";

  // Transaction atomique : activation du Member + clôture du recrutement
  // Garantit la cohérence même si l'une des deux opérations échoue
  let updated: {
    id: string;
    status: string;
    rpName: string | null;
    age: number | null;
    steamId: string | null;
    discordId: string | null;
    discordThreadId: string | null;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  try {
    updated = await prisma.$transaction(async (tx) => {
      if (decisionRaw === "ACCEPT" && recruitment.discordId) {
        await tx.member.updateMany({
          where: { discordId: recruitment.discordId },
          data: { isActive: true },
        });
      }
      return tx.recruitment.update({
        where: { id },
        data: {
          status: nextStatus,
          // Persiste le steamId trouvé via fallback Member si absent sur la fiche
          ...(steamId && !recruitment.steamId ? { steamId } : {}),
        },
        select: {
          id: true,
          status: true,
          rpName: true,
          age: true,
          steamId: true,
          discordId: true,
          discordThreadId: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
        },
      });
    });
  } catch (txErr) {
    logError("recruitment_decide_transaction_failed", { requestId, recruitmentId: id, decision: decisionRaw }, txErr);
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR" }, { status: 500 });
  }

  const updatedNotes = parseRecruitmentNotes(updated.notes ?? null);
  const evaluation = extractRecruitmentEvaluation(updatedNotes, null);
  const recruiterId = updatedNotes.claimedById ?? userId;
  const { resolveModelForRecruitment } = await import("@/lib/recruitment/models");
  const evalModel = await resolveModelForRecruitment(updatedNotes.modelId ?? null);
  const totals = computeRecruitmentTotals(evaluation.scoresJson, evalModel.questions);

  // ── Auto-add WL famille LYG (synchrone, AVANT enqueue Discord) ────────
  // On veut connaître le résultat avant d'envoyer l'embed Discord, pour
  // qu'il reflète l'état réel : "✅ Auto-WL OK" ou "⚠️ À ajouter manuellement".
  // Non-bloquant : si le cookie n'est pas configuré ou expiré, on log
  // et on continue. Le chef peut re-tenter via /staff/family.
  let lygAutoAdd: "ok" | "failed" | "skipped" | undefined;
  let lygAutoAddError: string | null = null;
  if (decisionRaw === "ACCEPT") {
    if (steamId && /^\d{17}$/.test(steamId)) {
      try {
        const lygResult = await lygFamilyAdd(steamId);
        if (lygResult.ok) {
          lygAutoAdd = "ok";
          logInfo("recruitment_decide_lyg_add_ok", { requestId, recruitmentId: id, steamId, tookMs: lygResult.tookMs });
          await createAuditLog({
            actorType: "staff",
            actorId: userId,
            action: "LYG_FAMILY_ADD_AUTO",
            entity: "Recruitment",
            entityId: updated.id,
            entityName: updated.rpName,
            meta: { steamId, source: "recruitment_accept", tookMs: lygResult.tookMs },
          });
        } else {
          lygAutoAdd = "failed";
          lygAutoAddError = lygResult.error;
          logWarn("recruitment_decide_lyg_add_failed", {
            requestId, recruitmentId: id, steamId,
            error: lygResult.error, expired: lygResult.expired,
          });
          await createAuditLog({
            actorType: "staff",
            actorId: userId,
            action: "LYG_FAMILY_ADD_AUTO_FAILED",
            entity: "Recruitment",
            entityId: updated.id,
            entityName: updated.rpName,
            meta: { steamId, source: "recruitment_accept", error: lygResult.error, expired: lygResult.expired },
          });
        }
      } catch (err) {
        // Pas de cookie configuré ou autre erreur "système" — non-fatal.
        lygAutoAdd = "skipped";
        lygAutoAddError = err instanceof Error ? err.message : String(err);
        logWarn("recruitment_decide_lyg_add_skipped", {
          requestId, recruitmentId: id, steamId, reason: lygAutoAddError,
        });
      }
    } else {
      lygAutoAdd = "skipped";
      lygAutoAddError = "steamId invalide ou manquant";
    }
  }

  // Notification Discord — non bloquante : une panne Discord ne doit pas faire échouer la décision
  try {
    await enqueueRecruitmentDecision({
      familyId: FAMILY_ID,
      ticketId: updated.id,
      decision: decisionRaw as Decision,
      candidateRpName: updated.rpName ?? updated.discordId ?? "Unknown",
      candidateDiscordId: updated.discordId ?? undefined,
      candidateSteamId: steamId || updated.steamId || undefined,
      totalOn20: totals.totalOn20,
      totalPoints: totals.totalPoints,
      claimedByUserId: recruiterId,
      discordThreadId: updated.discordThreadId ?? null,
      lygAutoAdd,
      lygAutoAddError,
    });
  } catch (discordErr) {
    logError("recruitment_decide_enqueue_failed", { requestId, recruitmentId: id, decision: decisionRaw }, discordErr);
    // Non-bloquant : la décision est persistée, Discord sera notifié manuellement si besoin
  }

  // Attribution automatique des rôles Discord lors de l'acceptation
  if (decisionRaw === "ACCEPT") {
    const candidateDiscordId = (updated.discordId ?? "").trim();
    const isValidDiscordId = /^\d{17,20}$/.test(candidateDiscordId);
    if (isValidDiscordId) {
      await Promise.all(
        RECRUITMENT_ACCEPT_ROLE_IDS.map((roleId) =>
          enqueueAssignRole({
            familyId: FAMILY_ID,
            guildId: GUILD_ID,
            userDiscordId: candidateDiscordId,
            roleId,
            entity: "recruitment_ticket",
            entityId: updated.id,
          }).catch((err) => {
            logError("recruitment_decide_assign_role_failed", { requestId, recruitmentId: id, roleId, candidateDiscordId }, err);
          })
        )
      );

      // Nettoie les rôles résiduels RÉELLEMENT présents sur le membre
      // (ré-recrutement d'un ancien démote/réserviste/blacklist, ou un ancien
      // grade Famille). Sans ça il reste classé "démoté/<grade>" par le scope
      // → masqué (ou au mauvais grade) dans la liste, malgré sa WL. On lit le
      // mirror discordRoleIds pour n'enquêter que ce qu'il a (zéro job no-op).
      const memberForCleanup = await prisma.member
        .findFirst({
          where: { discordId: candidateDiscordId },
          select: { id: true, discordRoleIds: true },
        })
        .catch(() => null);

      // Sanctions bloquantes encore ACTIVES (DEMOTE / RESERVISTE / BLACKLIST) :
      // un ré-recrutement accepté les rend obsolètes. Sans cette clôture, la
      // sanction restait ACTIVE et bloquait toute nouvelle sanction du même
      // type (cas Roger Delafonte : démote → ré-recruté → re-démote impossible).
      if (memberForCleanup?.id) {
        try {
          const closed = await prisma.sanction.updateMany({
            where: {
              memberId: memberForCleanup.id,
              status: "ACTIVE",
              clearedAt: null,
              type: { in: [...BLOCKING_SANCTION_TYPES] },
            },
            data: {
              status: "CLOSED",
              clearedAt: new Date(),
              clearedStatus: "APPLIED",
              clearedError: "Auto-clôture — ré-recrutement accepté, sanction obsolète",
            },
          });
          if (closed.count > 0) {
            logInfo("recruitment_decide_sanctions_autoclosed", {
              requestId,
              recruitmentId: id,
              memberId: memberForCleanup.id,
              closedCount: closed.count,
            });
          }
        } catch (err) {
          logError("recruitment_decide_sanctions_autoclose_failed", { requestId, recruitmentId: id }, err);
        }
      }
      const currentRoles = Array.isArray(memberForCleanup?.discordRoleIds)
        ? memberForCleanup!.discordRoleIds
        : [];
      const rolesToRemove = currentRoles.filter((rid) =>
        RECRUITMENT_REMOVE_ROLE_IDS.has(rid)
      );
      if (rolesToRemove.length > 0) {
        logInfo("recruitment_decide_cleanup_roles", {
          requestId,
          recruitmentId: id,
          candidateDiscordId,
          rolesToRemove,
        });
        await Promise.all(
          rolesToRemove.map((roleId) =>
            enqueueRemoveRole({
              familyId: FAMILY_ID,
              guildId: GUILD_ID,
              userDiscordId: candidateDiscordId,
              roleId,
              entity: "recruitment_ticket",
              entityId: updated.id,
            }).catch((err) => {
              logError("recruitment_decide_remove_role_failed", { requestId, recruitmentId: id, roleId, candidateDiscordId }, err);
            })
          )
        );
      }
    } else {
      logWarn("recruitment_decide_invalid_discord_id", { requestId, recruitmentId: id, discordId: updated.discordId ?? "vide" });
    }
  }

  logInfo("recruitment_decided", {
    requestId,
    recruitmentId: id,
    decision: decisionRaw,
    rpName: updated.rpName ?? updated.discordId ?? "Unknown",
    actorId: userId,
  });

  // Notification push au candidat accepté (fire-and-forget).
  if (decisionRaw === "ACCEPT" && updated.discordId) {
    void sendPushToDiscordIds([updated.discordId], {
      title: "🎉 Candidature acceptée",
      body: "Bienvenue dans la famille Los Esperados ! Ta candidature a été validée.",
      url: "/dashboard",
      tag: "recruit-" + updated.id,
    }).catch(() => {});
    void enqueueMemberDm({
      familyId: FAMILY_ID,
      discordId: updated.discordId,
      title: "🎉 Candidature acceptée",
      body: "Bienvenue dans la famille Los Esperados ! Ta candidature a été validée.",
      url: "/dashboard",
      dedupeKey: "member_dm:recruit:" + updated.id,
    }).catch(() => {});
  }

  const statusLabel = decisionRaw === "ACCEPT" ? "CLOSED_ACCEPTED" : "CLOSED_REJECTED";

  return NextResponse.json({
    ok: true,
    ticket: {
      id: updated.id,
      status: statusLabel,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      closedAt: updated.updatedAt.toISOString(),
      candidateRpName: updated.rpName ?? updated.discordId ?? "Unknown",
      candidateAge: updated.age ?? null,
      candidateSteamId: updated.steamId ?? null,
      candidateDiscordId: updated.discordId ?? null,
      claimedById: updatedNotes.claimedById ?? null,
      claimedAt: updatedNotes.claimedAt ?? null,
      claimedBy: updatedNotes.claimedById ? { id: updatedNotes.claimedById, name: null } : null,
      answersJson: Object.keys(evaluation.answersJson).length > 0 ? evaluation.answersJson : null,
      scoresJson: Object.keys(evaluation.scoresJson).length > 0 ? evaluation.scoresJson : null,
      totalPoints: totals.totalPoints,
      totalOn20: totals.totalOn20,
      staffNotes: updatedNotes.staffNotes ?? null,
    },
  });
}
