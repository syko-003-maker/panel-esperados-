/**
 * Parser des dates LYG pour les warns in-game.
 *
 * Bug API LYG : l'API renvoie des dates ISO 8601 avec suffixe `Z`, ex :
 *   "2026-05-07T17:32:25.000Z"
 * Mais le `17:32` représente en réalité l'heure **locale Brussels (CET/CEST)**,
 * pas UTC. Le suffixe Z est ABUSIF.
 *
 * Si on parse naïvement avec `new Date("2026-05-07T17:32:25.000Z")`, JS
 * interprète comme UTC. Discord affiche alors `<t:UNIX:f>` en local Brussels
 * → l'heure affichée est en avance de 1h (CET) ou 2h (CEST) par rapport à
 * l'heure réelle du warn en jeu.
 *
 * Cette fonction extrait les composants ISO et reconstruit le moment UTC
 * correct en supposant Europe/Brussels comme TZ source. Utilise Intl pour
 * gérer automatiquement les transitions DST (CEST l'été, CET l'hiver).
 */

const BRUSSELS_TZ = "Europe/Brussels";

/**
 * Calcule l'offset (en ms) Brussels par rapport à UTC à un instant UTC donné.
 * Été (CEST) → +7_200_000 (+2h), hiver (CET) → +3_600_000 (+1h).
 */
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
  // hour peut être "24" en cas de minuit selon Intl ; on borne à 0-23
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
 *
 * Comportement :
 *   "2026-05-07T17:32:25.000Z" + offset Brussels été (+2h)
 *      → 2026-05-07T15:32:25.000Z (instant UTC réel)
 *
 *   "2026-01-15T10:00:00.000Z" + offset Brussels hiver (+1h)
 *      → 2026-01-15T09:00:00.000Z (instant UTC réel)
 */
export function parseLygWarnDate(input: string | Date | null | undefined): Date | null {
  if (!input) return null;
  if (input instanceof Date) {
    return isNaN(input.getTime()) ? null : input;
  }
  if (typeof input !== "string") return null;

  const m = input.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!m) {
    // Format non reconnu → fallback parse natif
    const fb = new Date(input);
    return isNaN(fb.getTime()) ? null : fb;
  }
  const [, y, mo, d, h, mi, s] = m.map(Number) as unknown as number[];
  const naiveUtcMs = Date.UTC(y, mo - 1, d, h, mi, s);
  if (isNaN(naiveUtcMs)) return null;

  const offsetMs = getBrusselsOffsetMs(naiveUtcMs);
  return new Date(naiveUtcMs - offsetMs);
}

/**
 * Recalcule la vraie date UTC à partir d'une date stockée en DB qui a été
 * écrite avec le bug (Z suffix abusif sur du Brussels local).
 *
 * Utile pour la migration des LygWarn historiques.
 */
export function recomputeLygWarnDateFromBrokenDb(stored: Date): Date {
  const ms = stored.getTime();
  const offsetMs = getBrusselsOffsetMs(ms);
  return new Date(ms - offsetMs);
}
