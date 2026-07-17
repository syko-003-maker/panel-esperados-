/**
 * Visibilité du playtime CÔTÉ MEMBRE.
 *
 * Le membre voit son playtime de la semaine du **lundi au vendredi**. À partir
 * du **samedi** (et le dimanche), c'est **masqué** — les 2 derniers jours avant
 * la réunion deviennent secrets pour éviter que les gens se connectent à la
 * dernière minute pour faire leur temps le week-end. Ceux qui jouent toute la
 * semaine ont quand même pu voir leur progression jusque-là.
 *
 * ⚠️ Ne s'applique QU'au dashboard membre : le staff (liste membres, réunion)
 * voit toujours le playtime, tous les jours. Jour calculé en Europe/Brussels.
 */
export function isMemberPlaytimeHidden(now: Date = new Date()): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Brussels",
    weekday: "short",
  }).format(now);
  return weekday === "Sat" || weekday === "Sun";
}
