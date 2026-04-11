import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRecruiterOrAbove } from "@/lib/guards";
import { getSession } from "@/auth";
import { enqueueAssignRole, enqueueRecruitmentDecision } from "@/lib/discord/discord";
import { extractRecruitmentEvaluation, parseRecruitmentNotes } from "@/lib/recruitment/legacy";
import { computeRecruitmentTotals } from "@/lib/recruitment/scoring";

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

type Decision = (typeof DECISIONS)[number];

function isValidDecision(value: string) {
  return DECISIONS.includes(value as Decision);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
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
    }
  }
  if (decisionRaw === "ACCEPT" && !steamId) {
    return NextResponse.json({ ok: false, error: "INVALID_STEAM_ID" }, { status: 400 });
  }

  const notes = parseRecruitmentNotes(recruitment.notes ?? null);
  const isClaimedByUser = notes.claimedById === userId;
  if (notes.claimedById && !isClaimedByUser && !isChef) {
    return NextResponse.json({ ok: false, error: "NOT_CLAIMED_BY_USER" }, { status: 403 });
  }

  const nextStatus = decisionRaw === "ACCEPT" ? "ACCEPTED" : "REJECTED";

  const updated = await prisma.recruitment.update({
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

  const updatedNotes = parseRecruitmentNotes(updated.notes ?? null);
  const evaluation = extractRecruitmentEvaluation(updatedNotes, null);
  const recruiterId = updatedNotes.claimedById ?? userId;
  const totals = computeRecruitmentTotals(evaluation.scoresJson);

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
  });

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
            console.error(`[recruitment/decide] Échec enqueue ASSIGN_ROLE ${roleId} pour ${candidateDiscordId}:`, err);
          })
        )
      );
    } else {
      console.warn(`[recruitment/decide] Discord ID invalide ou manquant (${updated.discordId ?? "vide"}) — rôles non attribués pour le recrutement ${updated.id}`);
    }
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
