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

  // ISO with timezone (Z or ±HH:MM) → parse as UTC
  if (/T.*(Z|[+-]\d{2}:?\d{2})$/.test(trimmed)) {
    const d = new Date(trimmed);
    return Number.isNaN(d.getTime()) ? trimmed : brusselsFormatter.format(d);
  }

  // ISO without timezone (YYYY-MM-DDTHH:mm:ss) → assume UTC
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    const d = new Date(`${trimmed}Z`); // Append Z to treat as UTC
    return Number.isNaN(d.getTime()) ? trimmed : brusselsFormatter.format(d);
  }

  // Local string (YYYY-MM-DD HH:mm:ss) → parse as UTC, format in Brussels
  const localMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (localMatch) {
    const [, y, m, d, h, min] = localMatch;
    const d_obj = new Date(`${y}-${m}-${d}T${h}:${min}:00Z`);
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
