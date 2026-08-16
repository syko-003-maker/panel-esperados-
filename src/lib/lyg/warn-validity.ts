/**
 * Validité des warns in-game (LYG).
 *
 * Un warn n'est plus compté au-delà de 3 mois. Le drapeau `expired` vient de
 * l'API LYG et fait autorité quand il est à `true` — mais il ne peut pas être
 * la SEULE source, parce qu'il n'est rafraîchi en base que pour les membres
 * réellement interrogés par le poller.
 *
 * Or le poller (`lygWarnPoller.ts`) exclut volontairement :
 *   - les membres inactifs,
 *   - les réservistes / démotés / blacklistés,
 *   - le chef et le sous-chef de famille.
 *
 * Pour eux, `expired` reste figé sur la valeur du dernier passage, parfois
 * vieille de plusieurs mois : un warn périmé continuait donc d'être compté
 * comme actif sur /staff/warns (constaté sur 83 warns, dont ceux du chef de
 * famille et d'un réserviste).
 *
 * On garde donc `expired` (LYG peut annuler un warn AVANT les 3 mois — vu sur
 * 4 warns récents) et on ajoute la règle de date par-dessus. La combinaison ne
 * peut que retirer des warns du décompte, jamais en ré-activer un.
 */

export const WARN_VALIDITY_MONTHS = 3;

/** Date-limite : un warn antérieur à cet instant n'est plus valide. */
export function getWarnValidityCutoff(now: Date = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - WARN_VALIDITY_MONTHS);
  return cutoff;
}

/**
 * Un warn compte-t-il encore ? `false` dès que LYG l'a expiré OU qu'il a
 * dépassé les 3 mois.
 */
export function isLygWarnActive(
  warn: { expired?: boolean | null; warnDate?: Date | string | null },
  now: Date = new Date()
): boolean {
  if (warn.expired) return false;
  if (!warn.warnDate) return true; // date inconnue : on ne périme pas à l'aveugle
  const date = warn.warnDate instanceof Date ? warn.warnDate : new Date(warn.warnDate);
  if (Number.isNaN(date.getTime())) return true;
  return date.getTime() >= getWarnValidityCutoff(now).getTime();
}
