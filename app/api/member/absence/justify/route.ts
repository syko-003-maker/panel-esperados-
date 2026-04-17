import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { getUserRole } from "@/server/auth/rbac";
import { getMemberScopeOrNull } from "@/server/member/scope";
import { postDiscordMessage } from "@/server/worker/post-discord";
import { enforceRateLimit } from "@/server/rate-limit";
import { resolveFamilyId, FAMILY_SLUG } from "@/lib/family";

const DISCORD_CHANNEL_ID = "1335303582043607222";

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function formatDateFr(date: Date): string {
  return date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session as any).user?.id;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = await getUserRole(session);
    if (!role) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const linkedMember = await getMemberScopeOrNull(session);
    if (!linkedMember) {
      return NextResponse.json({ code: "MEMBER_NOT_LINKED" }, { status: 403 });
    }

    const body = await req.json();
    const { reason, from, to } = body ?? {};
    const trimmedReason = typeof reason === "string" ? reason.trim() : "";

    if (!trimmedReason || trimmedReason.length < 10) {
      return NextResponse.json(
        { error: "reason must be at least 10 characters" },
        { status: 400 }
      );
    }

    const fromDate = parseDate(typeof from === "string" ? from : undefined);
    const toDate = parseDate(typeof to === "string" ? to : undefined);

    if ((from && !fromDate) || (to && !toDate)) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }

    // Dates obligatoires en DB : fallback sur aujourd'hui
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startAt = fromDate ?? today;
    const endAtRaw = toDate ?? fromDate ?? today;
    const endAt = new Date(endAtRaw);
    endAt.setHours(23, 59, 59, 999);

    const { discordId, memberId, rpName } = linkedMember;

    // Rate limit : 3 par 10 minutes
    const rate = await enforceRateLimit({
      discordId: discordId || "",
      key: "member:absence-justify",
    });

    if (!rate.ok) {
      const response = NextResponse.json({ error: "Too many requests" }, { status: 429 });
      response.headers.set("Retry-After", Math.ceil(rate.retryAfterMs / 1000).toString());
      return response;
    }

    // Résolution du familyId
    let familyId = FAMILY_SLUG;
    try {
      familyId = await resolveFamilyId(FAMILY_SLUG);
    } catch {
      // garde le slug en fallback
    }

    // 1. Créer l'absence en base
    const absence = await prisma.absence.create({
      data: {
        familyId,
        discordId: discordId || "",
        memberId,
        reason: trimmedReason,
        notes: JSON.stringify({
          v: 1,
          type: "GENERAL",
          meetingDate: null,
          memberNotes: trimmedReason,
          rejectionReason: null,
          rejectedById: null,
          rejectedAt: null,
        }),
        startAt,
        endAt,
        status: "PENDING",
        createdById: userId,
      },
    });

    logger.debug("api:absence", `Absence created in DB: ${absence.id} for ${discordId}`);

    // 2. Construire la période affichée
    const periodeLabel = (() => {
      if (fromDate && toDate)
        return `Du ${formatDateFr(fromDate)} au ${formatDateFr(toDate)}`;
      if (fromDate)
        return `Depuis le ${formatDateFr(fromDate)}`;
      if (toDate)
        return `Jusqu'au ${formatDateFr(toDate)}`;
      return "Non précisée";
    })();

    // 3. Envoyer l'embed Discord
    const embed = {
      title: "📌 Justification d'absence",
      description: "Nouvelle demande envoyée depuis l'espace membre.",
      color: 0xf59e0b, // amber
      fields: [
        { name: "👤 Membre", value: rpName || "Inconnu", inline: true },
        { name: "🆔 Discord ID", value: discordId || "N/A", inline: true },
        { name: "📅 Période concernée", value: periodeLabel, inline: false },
        { name: "📝 Motif communiqué", value: trimmedReason, inline: false },
      ],
      footer: { text: "Panel Los Esperados" },
      timestamp: new Date().toISOString(),
    };

    const discordResponse = await postDiscordMessage({
      channelId: DISCORD_CHANNEL_ID,
      embeds: [embed],
    });

    if (!discordResponse.ok) {
      logger.warn("api:absence", `Discord worker error: ${discordResponse.error}`);
      // L'absence est déjà en DB — on retourne quand même success
    }

    logger.immediate("api:absence", `✓ Absence justified for ${discordId}`, {
      absenceId: absence.id,
      messageId: discordResponse.ok ? discordResponse.messageId : null,
    });

    return NextResponse.json({ ok: true, absenceId: absence.id });
  } catch (error) {
    logger.error("api:absence", `${error}`);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
