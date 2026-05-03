import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePrivileged } from "@/lib/guards";
import {
  enqueueEmbedMessage,
  type DiscordEmbedPayload,
} from "@/lib/discord/discord";
import { computeMeetingSummary, DEFAULT_MEETING_FAMILY_ID, mapStoredMeetingDecisionToBusinessDecision } from "@/lib/meetings";
import { resolveFamilyId } from "@/lib/family";

const MAX_EMBED_FIELD_LENGTH = 1000;
const MAINTAIN_LABEL = "Maintiens à sa place";
const EVOLUTION_CODES = new Set([
  "UP",
  "DOUBLE_UP",
  "WEEK_VALID_1",
  "WEEK_VALID_2",
  "WEEK_VALID_3",
  "WEEK_INVALID",
]);
const SANCTION_CODES = new Set([
  "WARN_LIGHT",
  "WARN_HEAVY",
  "WARN",
  "WARNING",
  "PLAYTIME_WARN",
  "AVERT_ORAL_PLAYTIME",
  "AVERT_ORAL_REUNION",
  "AVERT_LEGER",
  "AVERT_LOURD",
  "WARNING_ORAL",
  "DEMOTE",
  "BLACKLIST",
  "RESERVE",
  "RESERVIST",
  "RESERVISTE",
  "EXCLUSION",
  "EXCLUDE",
  "REMOVE_TEST_RANK",
]);

const MEETING_DECISION_LABELS: Record<string, string | null> = {
  MAINTAIN: "Maintiens à sa place",
  KEEP: "Maintiens à sa place",
  NONE: "Maintiens à sa place",
  DEMOTE: "Démote",
  UP: "UP",
  DOUBLE_UP: "Double UP",
  WARN_LIGHT: "Avertissement léger",
  WARN_HEAVY: "Avertissement lourd",
  WARN: "Avertissement",
  WARNING: "Avertissement",
  PLAYTIME_WARN: "Averto playtime",
  AVERT_ORAL_PLAYTIME: "Averto playtime",
  AVERT_ORAL_REUNION: "Averto réunion",
  AVERT_LEGER: "Avertissement léger",
  AVERT_LOURD: "Avertissement lourd",
  RESERVE: "Réserviste",
  RESERVIST: "Réserviste",
  RESERVISTE: "Réserviste",
  BLACKLIST: "Blacklist",
  EXCLUSION: "Exclusion",
  EXCLUDE: "Exclusion",
  WEEK_VALID_1: "Semaine Validé 1",
  WEEK_VALID_2: "Semaine Validé 2",
  WEEK_VALID_3: "Semaine Validé 3",
  WEEK_INVALID: "Semaine Non Validé",
  REMOVE_TEST_RANK: "Test validé (rang retiré)",
  OTHER: null,
  AUTRE: null,
  WARNING_ORAL: "Averto réunion",
};

function formatMeetingDate(value: Date | string | null | undefined) {
  if (!value) return "Date inconnue";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  return date.toLocaleDateString("fr-FR");
}

function formatMinutes(minutes: number | null | undefined) {
  const safeMinutes = typeof minutes === "number" && Number.isFinite(minutes)
    ? Math.max(0, Math.round(minutes))
    : 0;
  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;
  if (hours === 0) return `${remainingMinutes}min`;
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}min`;
}

function truncateLines(
  lines: string[],
  maxChars = MAX_EMBED_FIELD_LENGTH,
  separator = "\n\n"
) {
  if (lines.length === 0) return "-";

  const keptLines: string[] = [];
  let totalLength = 0;

  for (const line of lines) {
    const separatorLength = keptLines.length > 0 ? separator.length : 0;
    const nextLength = totalLength + line.length + separatorLength;
    if (nextLength > maxChars) {
      const remaining = lines.length - keptLines.length;
      if (remaining > 0) {
        keptLines.push(`• ... (+${remaining} autre${remaining > 1 ? "s" : ""})`);
      }
      break;
    }

    keptLines.push(line);
    totalLength = nextLength;
  }

  return keptLines.join(separator);
}

function resolveDecisionCode(row: {
  sanctionType?: string | null;
  decisionType?: string | null;
}) {
  // Use the shared lib function so all aliases (AVERT_LOURD→WARN_HEAVY, etc.) are normalised
  return mapStoredMeetingDecisionToBusinessDecision(
    row.decisionType ?? null,
    row.sanctionType ?? null
  );
}

function translateDecision(code: string | null | undefined) {
  const normalized = String(code ?? "").trim().toUpperCase();
  if (!normalized) return null;
  return MEETING_DECISION_LABELS[normalized] ?? null;
}

function buildMeetingPublishEmbed(meeting: {
  title: string | null;
  weekKey: string;
  meetingDate: Date | null;
  description: string | null;
  rows: Array<{
    rpNameSnapshot: string;
    playtimeMinutes: number;
    sanctionType: string | null;
    decisionType: string;
    isJustified: boolean;
  }>;
}) {
  const summary = computeMeetingSummary(meeting.rows, {
    meetingDate: meeting.meetingDate,
    notes: meeting.description,
  });

  const evolutionsMembers = new Map<string, string[]>();
  const sanctionsMembers = new Map<string, string[]>();
  const remainingCases: string[] = [];

  for (const row of meeting.rows) {
    const decisionCode = resolveDecisionCode(row);
    const translatedDecision = translateDecision(decisionCode);
    if (translatedDecision) {
      const memberLine = `• ${String(row.rpNameSnapshot ?? "Membre inconnu").trim() || "Membre inconnu"} — ${formatMinutes(row.playtimeMinutes)} — ${translatedDecision}`;

      if (translatedDecision === MAINTAIN_LABEL) {
        remainingCases.push(memberLine);
      } else if (
        EVOLUTION_CODES.has(decisionCode) ||
        decisionCode.startsWith("WEEK_VALID_")
      ) {
        const members = evolutionsMembers.get(translatedDecision) ?? [];
        members.push(memberLine);
        evolutionsMembers.set(translatedDecision, members);
      } else if (SANCTION_CODES.has(decisionCode)) {
        const members = sanctionsMembers.get(translatedDecision) ?? [];
        members.push(memberLine);
        sanctionsMembers.set(translatedDecision, members);
      } else {
        remainingCases.push(memberLine);
      }
    }
  }

  const statsLines = [
    `• Membres: ${summary.totalMembers}`,
    `• Sous seuil de playtime: ${summary.underThresholdCount}`,
    `• Justifiés: ${summary.justifiedCount}`,
    `• Maintiens: ${summary.noActionCount}`,
  ];

  const evolutionBlocks = Array.from(evolutionsMembers.entries())
    .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0], "fr"))
    .map(([label, members]) => [`• ${label}: ${members.length}`, ...members].join("\n"));

  const sanctionBlocks = Array.from(sanctionsMembers.entries())
    .sort((left, right) => right[1].length - left[1].length || left[0].localeCompare(right[0], "fr"))
    .map(([label, members]) => [`• ${label}: ${members.length}`, ...members].join("\n"));

  const finalNotes = String(meeting.description ?? "").trim() || "Aucune note finale.";
  const nowLabel = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const footerText = `Réunion Famille • Membres: ${summary.totalMembers} • Aujourd’hui à ${nowLabel}`;

  const embed: DiscordEmbedPayload = {
    title: `📋 Réunion Famille — ${formatMeetingDate(meeting.meetingDate)}`,
    color: 0x1d4ed8,
    fields: [
      {
        name: "📊 Statistiques",
          value: truncateLines(statsLines, MAX_EMBED_FIELD_LENGTH, "\n\n"),
        inline: false,
      },
      {
        name: "📈 Évolutions",
          value: truncateLines(
            evolutionBlocks.length > 0 ? evolutionBlocks : ["• Aucune"],
            MAX_EMBED_FIELD_LENGTH,
            "\n\n"
          ),
        inline: false,
      },
      {
        name: "⚖️ Sanctions prises",
          value: truncateLines(
            sanctionBlocks.length > 0 ? sanctionBlocks : ["• Aucune"],
            MAX_EMBED_FIELD_LENGTH,
            "\n\n"
          ),
        inline: false,
      },
      {
        name: "📌 Cas concernés",
          value: truncateLines(
            remainingCases.length > 0 ? remainingCases : ["• Aucun cas concerné"],
            MAX_EMBED_FIELD_LENGTH,
            "\n"
          ),
        inline: false,
      },
      {
        name: "📝 Notes finales",
          value: `\n\n${finalNotes.slice(0, MAX_EMBED_FIELD_LENGTH - 2)}`,
        inline: false,
      },
    ],
    footer: {
      text: footerText,
    },
    timestamp: new Date(),
  };

  return {
    embed,
    summaryText: summary.summaryText,
  };
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: {
      id: true,
      familyId: true,
      title: true,
      weekKey: true,
      status: true,
      meetingDate: true,
      description: true,
      summaryText: true,
      summaryChannelId: true,
      rows: {
        orderBy: { sortOrder: "asc" },
        select: {
          rpNameSnapshot: true,
          discordIdSnapshot: true,
          playtimeMinutes: true,
          attendanceStatus: true,
          sanctionType: true,
          decisionType: true,
          sanctionReason: true,
          staffNote: true,
          isJustified: true,
        },
      },
    },
  });
  if (!meeting) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  const familyDbId = await resolveFamilyId(DEFAULT_MEETING_FAMILY_ID);
  if (meeting.familyId !== familyDbId) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  if (meeting.status !== "CLOSED" && meeting.status !== "FINAL") {
    return NextResponse.json(
      { ok: false, error: "MEETING_MUST_BE_CLOSED_BEFORE_PUBLISH" },
      { status: 409 }
    );
  }

  const body = await req.json().catch(() => null);
  const config = await prisma.discordConfig.findUnique({
    where: { familyId: meeting.familyId },
    select: { meetingsLogChannelId: true, meetingsChannelId: true },
  });
  // Fallback: try slug-based config if CUID config has no channel
  let fallbackConfig: typeof config = null;
  if (!config?.meetingsLogChannelId && !config?.meetingsChannelId) {
    fallbackConfig = await prisma.discordConfig.findUnique({
      where: { familyId: DEFAULT_MEETING_FAMILY_ID },
      select: { meetingsLogChannelId: true, meetingsChannelId: true },
    });
  }
  const channelId =
    String(body?.channelId ?? "").trim() ||
    meeting.summaryChannelId ||
    config?.meetingsLogChannelId ||
    config?.meetingsChannelId ||
    fallbackConfig?.meetingsLogChannelId ||
    fallbackConfig?.meetingsChannelId ||
    "";

  if (!channelId) {
    return NextResponse.json({ ok: false, error: "MISSING_CHANNEL_ID" }, { status: 400 });
  }

  const { embed, summaryText } = buildMeetingPublishEmbed(meeting);
  const summary = meeting.summaryText || summaryText;

  await prisma.meeting.update({
    where: { id: meeting.id },
    data: {
      summaryText: summary,
      summaryChannelId: channelId,
      summaryPostedAt: new Date(),
    },
  });

  await enqueueEmbedMessage({
    familyId: meeting.familyId || DEFAULT_MEETING_FAMILY_ID,
    channelId,
    embeds: [embed],
    entity: "Meeting",
    entityId: meeting.id,
  });

  return NextResponse.json({ ok: true, channelId });
}
