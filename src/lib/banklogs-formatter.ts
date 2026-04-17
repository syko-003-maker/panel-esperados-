/**
 * Centralized date formatting for banklogs and all financial displays
 * Ensures consistent timezone handling across all banklog displays
 * 
 * CRITICAL RULE: ALL dates displayed on-screen MUST be formatted with this function.
 * This guarantees Europe/Brussels timezone without manual offset calculations.
 * 
 * Handles:
 * - ISO timestamps with timezone (Z or ±offset)
 * - ISO timestamps without timezone (assumed UTC)
 * - Local string timestamps (YYYY-MM-DD HH:mm:ss)
 * - Date objects
 * - Numeric timestamps (ms since epoch)
 * 
 * All output: "DD/MM/YYYY HH:mm" in Europe/Brussels timezone
 */

const brusselsFormatter = new Intl.DateTimeFormat("fr-BE", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Brussels",
});

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "longOffset",
    hour: "2-digit",
  }).formatToParts(date);

  const zoneName = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT+00:00";
  const match = /(GMT|UTC)([+-])(\d{1,2})(?::(\d{2}))?/.exec(zoneName);
  if (!match) return 0;

  const sign = match[2] === "-" ? -1 : 1;
  const hours = Number.parseInt(match[3], 10);
  const minutes = Number.parseInt(match[4] ?? "0", 10);
  return sign * (hours * 60 + minutes);
}

function parseBrusselsLocalToDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number
): Date {
  // Convert a Brussels local wall-clock datetime into a UTC instant.
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  for (let i = 0; i < 4; i++) {
    const offsetMinutes = getTimeZoneOffsetMinutes(new Date(utcMs), "Europe/Brussels");
    const nextUtcMs = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60_000;
    if (nextUtcMs === utcMs) break;
    utcMs = nextUtcMs;
  }
  return new Date(utcMs);
}

/**
 * Format any banklog/financial timestamp to "DD/MM/YYYY HH:mm" in Europe/Brussels
 * 
 * REQUIRED for:
 * - Banklog table rows
 * - Last sync timestamps
 * - Member history banklogs
 * - Any financial date displayed to user
 * 
 * @param input - string | number | Date | null | undefined
 * @returns Formatted string "DD/MM/YYYY HH:mm" or "—" if unparseable
 */
export function formatBanklogTime(input: string | number | Date | null | undefined): string {
  if (!input) return "—";

  // Handle Date objects directly
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? "—" : brusselsFormatter.format(input);
  }

  // Handle numeric timestamps (ms since epoch)
  if (typeof input === "number") {
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? "—" : brusselsFormatter.format(d);
  }

  // Handle strings
  const trimmed = String(input).trim();
  if (!trimmed) return "—";

  // ISO with timezone (Z or ±HH:MM) coming from banklogs should keep wall-clock.
  // LYG values are already aligned with in-game local time; converting again adds +1/+2h.
  const isoWithTzMatch = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/
  );
  if (isoWithTzMatch) {
    const [, y, m, d, h, min] = isoWithTzMatch;
    return `${d}/${m}/${y} ${h}:${min}`;
  }

  // ISO without timezone (YYYY-MM-DDTHH:mm:ss) -> treat as Brussels local time.
  // This avoids adding an extra hour when source values are already local wall-clock.
  const isoNoTzMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/);
  if (isoNoTzMatch) {
    const [, y, m, d, h, min, sec] = isoNoTzMatch;
    const parsed = parseBrusselsLocalToDate(
      Number(y),
      Number(m),
      Number(d),
      Number(h),
      Number(min),
      Number(sec)
    );
    return Number.isNaN(parsed.getTime()) ? trimmed : brusselsFormatter.format(parsed);
  }

  // Local string (YYYY-MM-DD HH:mm:ss) -> treat as Brussels local time.
  const localMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (localMatch) {
    const [, y, m, d, h, min, sec] = localMatch;
    const d_obj = parseBrusselsLocalToDate(
      Number(y),
      Number(m),
      Number(d),
      Number(h),
      Number(min),
      Number(sec ?? "0")
    );
    return Number.isNaN(d_obj.getTime()) ? trimmed : brusselsFormatter.format(d_obj);
  }

  // Fallback: try generic Date parsing
  const d = new Date(trimmed);
  if (!Number.isNaN(d.getTime())) {
    return brusselsFormatter.format(d);
  }

  // If all else fails, return original
  return trimmed;
}

/**
 * Alias for backward compatibility and clarity
 * Use formatBanklogTime - this is the same function
 */
export const formatDateBrussels = formatBanklogTime;
