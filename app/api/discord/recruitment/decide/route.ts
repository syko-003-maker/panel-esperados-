import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { makeRequestId, logInfo, logWarn, logError } from "@/lib/obs";
import {
  enqueueRecruitmentDecision,
  enqueueAssignRole,
  enqueueRemoveRole,
} from "@/lib/discord/discord";
import { parseRecruitmentNotes } from "@/lib/recruitment/legacy";
import { GRADE_ROLE_IDS_ORDERED, GRADE_LABEL_BY_ROLE_ID, getGradeLevelNumber } from "@/lib/grade-colors";
import { BLACKLIST_ROLE_ID, RESERVIST_ROLE_ID } from "@/lib/discord-grade";
import { DEMOTE_ROLE_ID } from "@/lib/discord-rbac";

// Constantes du grade attribué automatiquement par un recrutement accepté.
// Source de vérité : grade-colors. On les calcule au module load pour rester
// alignés avec les helpers utilisés ailleurs.
const NOVATO_ROLE_ID = "1408492476351778836";
const NOVATO_LABEL = GRADE_LABEL_BY_ROLE_ID[NOVATO_ROLE_ID] ?? "Novato";
const NOVATO_GRADE_LEVEL = getGradeLevelNumber(NOVATO_ROLE_ID);

const FAMILY_ID = "esperados";
const GUILD_ID = process.env.GUILD_ID ?? "1312845998753710151";
const STAFF_LEVEL = 5; // GRADE_LEVELS.STAFF
const INGEST_SECRET = process.env.INGEST_SECRET;

// Rôles attribués automatiquement lors de l'acceptation d'un recrutement
const RECRUITMENT_ACCEPT_ROLE_IDS = [
  "1408492476351778836", // Novato
  "1312845999340781643", // En Test
  "1312845999340781646", // Los Esperados
  "1408484776708673686", // Homme de rang
  "1325929087079813232", // Sans spé
] as const;

// Rôles à RETIRER lors de l'acceptation d'un recrutement, s'ils sont présents
// sur le membre (ex: ré-acceptation après démote/blacklist/réserviste, ou
// un ancien grade qu'il faut nettoyer avant d'attribuer Novato).
//
// Bug fix : avant ce patch, un membre démote qu'on re-recrutait gardait son
// rôle Demote → le panel le classait toujours en démote au lieu d'actif.
const RECRUITMENT_ACCEPT_ROLES_TO_REMOVE = new Set<string>([
  DEMOTE_ROLE_ID,
  BLACKLIST_ROLE_ID,
  RESERVIST_ROLE_ID,
  // Tous les anciens rôles de grade Famille (sauf Novato qui sera ré-assigné)
  ...GRADE_ROLE_IDS_ORDERED.filter(
    (rid) => rid !== "1408492476351778836" && // Novato (assigné)
             !RECRUITMENT_ACCEPT_ROLE_IDS.includes(rid as any)
  ),
]);

/**
 * POST /api/discord/recruitment/decide
 * Decide on recruitment from Discord button interaction
 * 
 * Body: { ticketKey, decision, staffDiscordId, staffUsername?, messageId?, channelId? }
 * Auth: x-ingest-secret header (Discord worker machine-to-machine)
 */
export async function POST(req: Request) {
  const requestId = makeRequestId();
  
  // Verify INGEST_SECRET
  const ingestSecret = req.headers.get("x-ingest-secret");
  if (!INGEST_SECRET) {
    logError("recruitment_decide_secret_not_configured", { requestId });
    return NextResponse.json(
      { ok: false, error: "INGEST_SECRET not configured" },
      { status: 503 }
    );
  }
  if (ingestSecret !== INGEST_SECRET) {
    logWarn("recruitment_decide_unauthorized_secret", { requestId });
    return NextResponse.json(
      { ok: false, error: "Unauthorized: Invalid INGEST_SECRET" },
      { status: 401 }
    );
  }
  
  try {
    const body = await req.json();
    const { ticketKey, decision, staffDiscordId, staffUsername, messageId, channelId } = body;
    
    if (!ticketKey || !decision || !staffDiscordId) {
      logWarn("recruitment_decide_missing_params", { requestId, body });
      return NextResponse.json(
        { ok: false, error: "Missing required parameters" },
        { status: 400 }
      );
    }
    
    if (!["APPROVE", "REFUSE"].includes(decision)) {
      logWarn("recruitment_decide_invalid_decision", { requestId, decision });
      return NextResponse.json(
        { ok: false, error: "Invalid decision. Must be APPROVE or REFUSE" },
        { status: 400 }
      );
    }

    const family = await prisma.family.findUnique({
      where: { slug: FAMILY_ID },
      select: { id: true },
    });

    if (!family) {
      logWarn("recruitment_decide_family_not_found", { requestId, familySlug: FAMILY_ID });
      return NextResponse.json(
        { ok: false, error: "Family not found" },
        { status: 404 }
      );
    }
    
    // Verify staff permissions
    const staffMember = await prisma.member.findUnique({
      where: { familyId_discordId: { familyId: family.id, discordId: staffDiscordId } },
      select: { id: true, isActive: true, gradeLevel: true, rpName: true, discordId: true },
    });
    
    if (!staffMember || !staffMember.isActive || (staffMember.gradeLevel ?? 0) < STAFF_LEVEL) {
      logWarn("recruitment_decide_unauthorized", { requestId, staffDiscordId });
      return NextResponse.json(
        { ok: false, error: "Unauthorized: Staff permissions required" },
        { status: 403 }
      );
    }
    
    // Find recruitment by ticketKey
    const recruitment = await prisma.recruitment.findUnique({
      where: { ticketKey },
      select: {
        id: true,
        status: true,
        rpName: true,
        steamId: true,
        discordId: true,
        discordThreadId: true,
        notes: true,
      },
    });
    
    if (!recruitment) {
      logWarn("recruitment_decide_not_found", { requestId, ticketKey });
      return NextResponse.json(
        { ok: false, error: "Recruitment not found" },
        { status: 404 }
      );
    }
    
    if (recruitment.status === "ACCEPTED" || recruitment.status === "REJECTED") {
      logWarn("recruitment_decide_already_closed", { requestId, ticketKey, status: recruitment.status });
      return NextResponse.json(
        { ok: false, error: "ALREADY_CLOSED", currentStatus: recruitment.status },
        { status: 409 }
      );
    }
    
    // Update recruitment status
    const newStatus = decision === "APPROVE" ? "ACCEPTED" : "REJECTED";
    
    const updated = await prisma.recruitment.update({
      where: { ticketKey },
      data: {
        status: newStatus,
        closedAt: new Date(),
        closedByDiscordId: staffDiscordId,
        closeReason: decision === "APPROVE" ? "Accepted by staff" : "Refused by staff",
      },
      select: {
        id: true,
        ticketKey: true,
        status: true,
        rpName: true,
        steamId: true,
        discordId: true,
        discordThreadId: true,
        closedAt: true,
      },
    });
    
    logInfo("recruitment_decide_success", {
      requestId,
      ticketKey,
      decision,
      newStatus,
      staffDiscordId,
      staffRpName: staffMember.rpName,
    });

    // Resolve claimedByUserId for the outbox job (recruiter who claimed this ticket)
    const notes = parseRecruitmentNotes(recruitment.notes ?? null);
    let claimedByUserId = notes.claimedById ?? "";
    if (!claimedByUserId) {
      // Fallback: find the User account linked to this staffDiscordId
      const staffAccount = await prisma.account.findFirst({
        where: { provider: "discord", providerAccountId: staffDiscordId },
        select: { userId: true },
      });
      claimedByUserId = staffAccount?.userId ?? "";
    }

    // Enqueue outbox job for log + whitelist + ticket close (unified path)
    // liveChannelId = the actual Discord channel where the button was clicked
    const liveChannelId = channelId || null;
    try {
      await enqueueRecruitmentDecision({
        familyId: FAMILY_ID,
        ticketId: updated.id,
        decision: decision === "APPROVE" ? "ACCEPT" : "REJECT",
        candidateRpName: updated.rpName ?? updated.discordId ?? "Unknown",
        candidateDiscordId: updated.discordId ?? undefined,
        candidateSteamId: updated.steamId ?? undefined,
        claimedByUserId,
        discordThreadId: liveChannelId || updated.discordThreadId || null,
      });
    } catch (enqueueErr) {
      logError("recruitment_decide_enqueue_failed", { requestId, ticketKey }, enqueueErr as Error);
    }

    // Attribution automatique des rôles Discord lors de l'acceptation
    if (decision === "APPROVE") {
      const candidateDiscordId = (updated.discordId ?? "").trim();
      const isValidDiscordId = /^\d{17,20}$/.test(candidateDiscordId);
      if (isValidDiscordId) {
        // 1. NETTOYAGE : retirer les rôles incompatibles présents sur le membre
        //    (Demote / Blacklist / Réserviste / anciens grades Famille).
        //    Sans ce nettoyage, un re-recrutement laissait l'ancien Demote
        //    en place → membre classé toujours en démote côté panel.
        const memberForCleanup = await prisma.member.findFirst({
          where: { familyId: family.id, discordId: candidateDiscordId },
          select: { id: true, discordRoleIds: true, grade: true, gradeLevel: true, roleDiscordId: true },
        }).catch(() => null);

        const currentRoles = Array.isArray(memberForCleanup?.discordRoleIds)
          ? memberForCleanup!.discordRoleIds
          : [];
        const rolesToRemove = currentRoles.filter((rid) =>
          RECRUITMENT_ACCEPT_ROLES_TO_REMOVE.has(rid)
        );

        if (rolesToRemove.length > 0) {
          logInfo("recruitment_decide_cleanup_roles", {
            requestId,
            ticketKey,
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
                logError(
                  "recruitment_decide_remove_role_failed",
                  { requestId, ticketKey, roleId, candidateDiscordId },
                  err as Error
                );
              })
            )
          );
        }

        // 2. Attribuer les nouveaux rôles standards de novato.
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
              logError("recruitment_decide_assign_role_failed", { requestId, ticketKey, roleId, candidateDiscordId }, err);
            })
          )
        );

        // 3. Sync DB Member.grade : sans ça le panel reste désynchro
        //    (Member.gradeLevel à 0 → exclu de /staff/warns, /staff/members
        //    onglet par grade, etc.) tant que personne ne fait un PATCH
        //    manuel /api/members/:discordId. Ex : Alexei avait gradeLevel=0
        //    après cleanup DEMOTE alors qu'il avait bien le rôle Novato.
        //
        //    On ne touche que si le membre existe déjà en base — la création
        //    Member est gérée ailleurs (worker outbox / sync Discord).
        if (memberForCleanup) {
          const needsGradeUpdate =
            memberForCleanup.grade !== NOVATO_LABEL ||
            memberForCleanup.gradeLevel !== NOVATO_GRADE_LEVEL ||
            memberForCleanup.roleDiscordId !== NOVATO_ROLE_ID;

          if (needsGradeUpdate) {
            try {
              await prisma.$transaction([
                prisma.member.update({
                  where: { id: memberForCleanup.id },
                  data: {
                    grade: NOVATO_LABEL,
                    gradeLevel: NOVATO_GRADE_LEVEL,
                    roleDiscordId: NOVATO_ROLE_ID,
                    isActive: true,
                  },
                }),
                prisma.gradeHistory.create({
                  data: {
                    memberId: memberForCleanup.id,
                    oldGrade: memberForCleanup.grade,
                    oldGradeLevel: memberForCleanup.gradeLevel,
                    newGrade: NOVATO_LABEL,
                    newGradeLevel: NOVATO_GRADE_LEVEL,
                    changedBy: staffDiscordId,
                    source: "SYNC",
                    notes: `Recrutement accepté (ticket ${ticketKey})`,
                  },
                }),
              ]);
              logInfo("recruitment_decide_grade_synced", {
                requestId,
                ticketKey,
                memberId: memberForCleanup.id,
                candidateDiscordId,
                oldGrade: memberForCleanup.grade,
                oldGradeLevel: memberForCleanup.gradeLevel,
                newGrade: NOVATO_LABEL,
                newGradeLevel: NOVATO_GRADE_LEVEL,
              });
            } catch (gradeErr) {
              logError(
                "recruitment_decide_grade_sync_failed",
                { requestId, ticketKey, memberId: memberForCleanup.id, candidateDiscordId },
                gradeErr as Error
              );
            }
          }
        }
      }
    }
    
    return NextResponse.json({
      ok: true,
      recruitment: {
        id: updated.id,
        ticketKey: updated.ticketKey,
        status: newStatus,
        rpName: updated.rpName,
        steamId: updated.steamId,
        discordId: updated.discordId,
        threadId: updated.discordThreadId,
        closedAt: updated.closedAt?.toISOString(),
      },
      staff: {
        discordId: staffMember.discordId,
        rpName: staffMember.rpName,
      },
    });
    
  } catch (error) {
    logError("recruitment_decide_error", { requestId }, error as Error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
