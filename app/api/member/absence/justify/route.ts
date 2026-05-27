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
    const { reason, from, to, type: rawType, meetingDate: rawMeetingDate } = body ?? {};
    const trimmedReason = typeof reason === "string" ? reason.trim() : "";

    if (!trimmedReason || trimmedReason.length < 10) {
      return NextResponse.json(
        { error: "reason must be at least 10 characters" },
        { status: 400 }
      );
    }

    // Type d'absence : MEETING (réunion dominicale) ou GENERAL (période libre).
    // Fallback GENERAL si absent → compat avec anciens appels qui ne passaient
    // pas le champ.
    const type: "MEETING" | "GENERAL" =
      rawType === "MEETING" ? "MEETING" : "GENERAL";

    let startAt: Date;
    let endAt: Date;
    let meetingDateIso: string | null = null;

    if (type === "MEETING") {
      // Réunion : on attend juste la date du dimanche concerné (YYYY-MM-DD).
      // On normalise à minuit UTC pour avoir un point d'ancrage stable
      // (le staff finalize la réunion sur cette même clé).
      const meetingDate = parseDate(
        typeof rawMeetingDate === "string" ? rawMeetingDate : undefined,
      );
      if (!meetingDate) {
        return NextResponse.json(
          { error: "meetingDate requis pour une absence réunion" },
          { status: 400 },
        );
      }
      // Le pattern attendu côté staff/meeting est T00:00:00.000Z (UTC).
      const utc = new Date(`${rawMeetingDate.slice(0, 10)}T00:00:00.000Z`);
      startAt = utc;
      endAt = utc;
      meetingDateIso = utc.toISOString();
    } else {
      // Général : période libre, dates optionnelles → fallback aujourd'hui.
      const fromDate = parseDate(typeof from === "string" ? from : undefined);
      const toDate = parseDate(typeof to === "string" ? to : undefined);

      if ((from && !fromDate) || (to && !toDate)) {
        return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      startAt = fromDate ?? today;
      const endAtRaw = toDate ?? fromDate ?? today;
      endAt = new Date(endAtRaw);
      endAt.setHours(23, 59, 59, 999);

      // Garde-fou : limite à 2 mois (60 jours) comme côté staff.
      const diffMs = endAt.getTime() - startAt.getTime();
      const SIXTY_DAYS = 60 * 24 * 60 * 60 * 1000;
      if (diffMs > SIXTY_DAYS) {
        return NextResponse.json(
          { error: "La période ne peut pas excéder 2 mois" },
          { status: 400 },
        );
      }
    }

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
          type,
          meetingDate: meetingDateIso,
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

    // 2. Construire la période affichée selon le type
    const periodeLabel = (() => {
      if (type === "MEETING") {
        return `Réunion du ${formatDateFr(startAt)}`;
      }
      // GENERAL
      const startStr = formatDateFr(startAt);
      const endStr = formatDateFr(endAt);
      if (startStr === endStr) return `Le ${startStr}`;
      return `Du ${startStr} au ${endStr}`;
    })();

    // 3. Envoyer l'embed Discord
    const isMeeting = type === "MEETING";
    const embed = {
      title: isMeeting ? "📅 Absence — Réunion" : "📌 Absence — Période générale",
      description: "Nouvelle demande envoyée depuis l'espace membre.",
      color: isMeeting ? 0xf59e0b /* amber */ : 0x9b2335 /* bordeaux */,
      fields: [
        { name: "👤 Membre", value: rpName || "Inconnu", inline: true },
        { name: "🆔 Discord ID", value: discordId || "N/A", inline: true },
        {
          name: isMeeting ? "📅 Réunion concernée" : "📅 Période concernée",
          value: periodeLabel,
          inline: false,
        },
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
