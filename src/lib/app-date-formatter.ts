/**
 * Unified date formatters for the entire app — Europe/Brussels timezone.
 *
 * formatAppDate     → DD/MM/YYYY HH:MM (date + heure, format de référence)
 * formatAppDateOnly → DD/MM/YYYY        (date seule, pour listings)
 *
 * Tous deux gèrent : null/undefined → "—", string non parseable → renvoyé tel quel,
 * Date invalide → "—". Acceptent string | number | Date.
 *
 * Centralise les ~25 implémentations locales de fmtDate divergentes (lot 5).
 */

export { formatBanklogTime as formatAppDate } from "./banklog-time";
import { formatBanklogTime } from "./banklog-time";

/**
 * Variante "date seule" : ne montre pas l'heure. Utilisée pour les listes
 * (warns, sanctions, debts, meetings) où l'heure n'apporte rien.
 */
export function formatAppDateOnly(input: string | number | Date | null | undefined): string {
  const full = formatBanklogTime(input);
  if (full === "—") return "—";
  // formatBanklogTime renvoie "DD/MM/YYYY HH:MM" — on coupe l'heure si présente.
  // Si format inattendu (fallback string non parseable), on retourne tel quel.
  const space = full.indexOf(" ");
  return space > 0 ? full.slice(0, space) : full;
}
