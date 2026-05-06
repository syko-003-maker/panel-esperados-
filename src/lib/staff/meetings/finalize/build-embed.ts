/**
 * Construction de l'embed Discord de finalize meeting (compte-rendu).
 * Pure : prend des données, retourne un DiscordEmbedPayload.
 *
 * Extrait de app/api/staff/meetings/[id]/finalize/route.ts (Lot 9).
 */

import type { DiscordEmbedPayload } from "@/lib/discord/discord";
import { resolveMeetingDecisionCode, translateMeetingDecision } from "./decision-codes";
import {
  formatMeetingDate,
  formatMeetingMinutes,
  truncateEmbedLines,
  MAX_EMBED_FIELD_LENGTH,
} from "./format-helpers";

export interface FinalizeEmbedRow {
  rpNameSnapshot?: string | null;
  playtimeMinutes?: number | null;
  sanctionType?: string | null;
  decisionType?: string | null;
}

export interface FinalizeEmbedParams {
  meetingDate: Date | string | null | undefined;
  meetingLabel: string;
  rows: FinalizeEmbedRow[];
  notes?: string | null;
  statsSummary: Array<{ label: string; value: number }>;
}

export function buildMeetingFinalizeEmbed(params: FinalizeEmbedParams): DiscordEmbedPayload {
  const decisionCounts = new Map<string, number>();
  const concernedCases: string[] = [];

  for (const row of params.rows) {
    const decisionCode = resolveMeetingDecisionCode(row);
    const translatedDecision = translateMeetingDecision(decisionCode);
    if (!translatedDecision) continue;

    const memberName = String(row.rpNameSnapshot ?? "Membre inconnu").trim() || "Membre inconnu";
    const playtime = formatMeetingMinutes(row.playtimeMinutes);

    decisionCounts.set(translatedDecision, (decisionCounts.get(translatedDecision) ?? 0) + 1);
    concernedCases.push(`${memberName} — ${playtime} — ${translatedDecision}`);
  }

  const sanctionsLines = Array.from(decisionCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "fr"))
    .map(([label, count]) => `${label}: ${count}`);

  const statsLines = params.statsSummary.map(({ label, value }) => `${label}: ${value}`);
  const finalNotes = String(params.notes ?? "").trim() || "Aucune note finale.";

  return {
    title: `📋 Réunion Famille — ${formatMeetingDate(params.meetingDate)}`,
    description: params.meetingLabel,
    color: 0x1d4ed8,
    fields: [
      { name: "📊 Statistiques", value: truncateEmbedLines(statsLines), inline: false },
      {
        name: "⚖️ Sanctions prises",
        value: truncateEmbedLines(sanctionsLines.length > 0 ? sanctionsLines : ["Aucune"]),
        inline: false,
      },
      {
        name: "📌 Cas concernés",
        value: truncateEmbedLines(concernedCases.length > 0 ? concernedCases : ["Aucun cas concerné"]),
        inline: false,
      },
      {
        name: "📝 Notes finales",
        value: finalNotes.slice(0, MAX_EMBED_FIELD_LENGTH),
        inline: false,
      },
    ],
    footer: {
      text: `Réunion Famille • Membres: ${params.rows.length}`,
    },
    timestamp: new Date(),
  };
}
