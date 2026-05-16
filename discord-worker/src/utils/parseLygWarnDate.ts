/**
 * Copie locale du helper panel `src/lib/lyg/parseLygWarnDate.ts`.
 * Le worker est un package TypeScript séparé sans path mapping vers `src/`,
 * d'où la duplication.
 *
 * Bug API LYG : suffixe `Z` abusif sur des heures locales Brussels.
 * Sans cette correction, les embeds Discord de warns in-game affichent
 * +1h (CET) ou +2h (CEST) par rapport à l'heure réelle.
 */

const BRUSSELS_TZ = "Europe/Brussels";

function getBrusselsOffsetMs(utcInstantMs: number): number {
  const utcDate = new Date(utcInstantMs);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: BRUSSELS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(utcDate);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const localMs = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return localMs - utcInstantMs;
}

/**
 * Parse une date LYG vers son instant UTC réel.
 * Renvoie `null` si l'input est invalide.
 */
export function parseLygWarnDate(input: string | Date | null | undefined): Date | null {
  if (!input) return null;
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input;
  }
  if (typeof input !== "string") return null;

  const m = input.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!m) {
    const fb = new Date(input);
    return isNaN(fb.getTime()) ? null : fb;
  }
  const [, y, mo, d, h, mi, s] = m.map(Number) as unknown as number[];
  const naiveUtcMs = Date.UTC(y, mo - 1, d, h, mi, s);
  if (isNaN(naiveUtcMs)) return null;

  const offsetMs = getBrusselsOffsetMs(naiveUtcMs);
  return new Date(naiveUtcMs - offsetMs);
}
