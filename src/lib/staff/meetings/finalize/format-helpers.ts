/**
 * Helpers de formatting pour l'embed Discord de finalize meeting.
 * Pure : juste de la string manipulation.
 *
 * Extrait de app/api/staff/meetings/[id]/finalize/route.ts (Lot 9).
 */

export const MAX_EMBED_FIELD_LENGTH = 1000;

/**
 * Format date "DD/MM/YYYY" en locale FR. Retourne "Date inconnue" si
 * input null/undefined/invalide.
 */
export function formatMeetingDate(value: Date | string | null | undefined): string {
  if (!value) return "Date inconnue";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  return date.toLocaleDateString("fr-FR");
}

/**
 * Format minutes en "Xh Ymin" (ou "Xh", "Ymin", "0min").
 * Tolérant : null/undefined/non-finite → 0min.
 */
export function formatMeetingMinutes(minutes: number | null | undefined): string {
  const safe = typeof minutes === "number" && Number.isFinite(minutes)
    ? Math.max(0, Math.round(minutes))
    : 0;
  const hours = Math.floor(safe / 60);
  const remaining = safe % 60;
  if (hours === 0) return `${remaining}min`;
  if (remaining === 0) return `${hours}h`;
  return `${hours}h ${remaining}min`;
}

/**
 * Tronque un array de lignes à `maxChars` (longueur cumulée + séparateurs \n).
 * Si troncation, ajoute "... (+N autre(s))" en dernière ligne.
 * Retour : "-" si l'array est vide.
 */
export function truncateEmbedLines(lines: string[], maxChars = MAX_EMBED_FIELD_LENGTH): string {
  if (lines.length === 0) return "-";

  const keptLines: string[] = [];
  let length = 0;

  for (const line of lines) {
    const nextLength = length + line.length + (keptLines.length > 0 ? 1 : 0);
    if (nextLength > maxChars) {
      const remaining = lines.length - keptLines.length;
      if (remaining > 0) {
        keptLines.push(`... (+${remaining} autre${remaining > 1 ? "s" : ""})`);
      }
      break;
    }
    keptLines.push(line);
    length = nextLength;
  }

  return keptLines.join("\n");
}
