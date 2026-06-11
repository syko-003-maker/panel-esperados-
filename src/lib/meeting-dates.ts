/**
 * Dates de réunion famille.
 *
 * Les réunions ont lieu **un dimanche sur deux** (bi-hebdomadaire), à 21h.
 * Ancre : un dimanche de réunion confirmé. Tout dimanche de réunion vérifie
 * « (date − ancre) est un multiple de 14 jours ».
 *
 * ⚠️ Si la cadence ou l'ancre change un jour, mettre à jour ANCHOR_* ci-dessous.
 * Le 7 juin 2026 est un dimanche de réunion confirmé.
 */

// Ancre en UTC (date-only, immunisé aux changements d'heure d'été/hiver).
const ANCHOR_MEETING_UTC = Date.UTC(2026, 5, 7); // 7 juin 2026 (mois 0-indexé)
const CYCLE_DAYS = 14;
const DAY_MS = 86_400_000;

/**
 * Renvoie les `count` prochains dimanches DE RÉUNION (un sur deux) à partir
 * d'aujourd'hui. Format identique à l'ancien sélecteur :
 *   { value: "YYYY-MM-DD", label: "7 juin" }
 */
export function getUpcomingMeetingSundays(count = 6): { value: string; label: string }[] {
  const results: { value: string; label: string }[] = [];

  // Prochain dimanche à partir d'aujourd'hui — aujourd'hui inclus si on est
  // dimanche : une absence doit pouvoir être posée le jour même de la réunion.
  const d = new Date();
  const daysUntilSunday = (7 - d.getDay()) % 7;
  d.setDate(d.getDate() + daysUntilSunday);

  // On avance dimanche par dimanche et on ne garde que ceux qui tombent sur la
  // cadence bi-hebdomadaire (écart multiple de 14 jours avec l'ancre).
  let guard = 0;
  while (results.length < count && guard < 200) {
    guard += 1;
    const dUTC = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((dUTC - ANCHOR_MEETING_UTC) / DAY_MS);
    if (((diffDays % CYCLE_DAYS) + CYCLE_DAYS) % CYCLE_DAYS === 0) {
      const copy = new Date(d);
      results.push({
        value: copy.toISOString().slice(0, 10),
        label: copy.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }),
      });
    }
    d.setDate(d.getDate() + 7);
  }

  return results;
}
