/**
 * Unified date/time formatter for the entire application
 * ALL dates displayed on-screen MUST use this function
 * Ensures consistent Europe/Brussels timezone across the app
 */

const brusselsFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: "Europe/Brussels",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Format any timestamp to "DD/MM/YYYY HH:mm" in Europe/Brussels timezone
 * 
 * @param input - ISO string, Date object, or null/undefined
 * @returns Formatted date string or "-" if invalid
 */
export function formatBanklogTime(input: string | Date | null | undefined): string {
  if (!input) return "-";

  // Handle Date objects
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? "-" : brusselsFormatter.format(input);
  }

  // Handle strings
  const trimmed = String(input).trim();
  if (!trimmed) return "-";

  // Try parsing as ISO date
  const d = new Date(trimmed);
  if (!Number.isNaN(d.getTime())) {
    return brusselsFormatter.format(d);
  }

  // If parsing fails, return original string
  return trimmed;
}

/**
 * Alias for backward compatibility
 */
export const formatDateBrussels = formatBanklogTime;
