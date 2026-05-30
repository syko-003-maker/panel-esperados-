/**
 * Données des printers LYG pour le calculateur famille.
 *
 * Chaque printer est défini par 3 chiffres bruts :
 *   - cost          : prix d'achat (« Coût total net »)  — connu pour tous
 *   - revenuNetMin  : revenu net par minute               — null = à renseigner
 *   - perteRecharge : coût de recharge / RECHARGE_INTERVAL_MIN min — null = à renseigner
 *
 * Tout le reste se calcule :
 *   - revenu net / h = revenuNetMin × 60
 *   - temps de rentabilisation = cost ÷ revenuNetMin
 *
 * ⚠️ Les prix viennent de la boutique en jeu. Le revenu net/min et le coût de
 * recharge ne sont relevables qu'en posant le printer en jeu — pour les modèles
 * où ils valent `null`, il faut compléter ci-dessous.
 */

export type Printer = {
  id: string;
  name: string;
  /** Prix d'achat (« Coût total net »). Connu pour tous. */
  cost: number;
  /** Revenu net par minute. `null` = donnée manquante. */
  revenuNetMin: number | null;
  /** Coût de recharge par cycle de RECHARGE_INTERVAL_MIN minutes. `null` = manquant. */
  perteRecharge: number | null;
};

/** Intervalle de recharge des printers (minutes). */
export const RECHARGE_INTERVAL_MIN = 3.2;

// Triés par prix croissant. revenuNetMin/perteRecharge connus uniquement pour
// les 4 modèles relevés ; les autres sont à compléter (null).
export const PRINTERS: Printer[] = [
  { id: "bronze", name: "Bronze Printer", cost: 10_000, revenuNetMin: null, perteRecharge: null },
  { id: "argent", name: "Argent Printer", cost: 15_000, revenuNetMin: null, perteRecharge: null },
  { id: "or", name: "Or Printer", cost: 20_000, revenuNetMin: null, perteRecharge: null },
  { id: "platine", name: "Platine Printer", cost: 35_000, revenuNetMin: null, perteRecharge: null },
  { id: "diamant-vip", name: "Diamant VIP Printer", cost: 45_000, revenuNetMin: null, perteRecharge: null },
  { id: "titane-vip", name: "Titane VIP Printer", cost: 55_000, revenuNetMin: null, perteRecharge: null },
  { id: "amethyste-vip", name: "Amethyste VIP Printer", cost: 70_000, revenuNetMin: null, perteRecharge: null },
  { id: "emeraude-vip", name: "Emeraude VIP Printer", cost: 100_000, revenuNetMin: 7_950, perteRecharge: 5_281 },
  { id: "saphyr-vip", name: "Saphyr VIP Printer", cost: 150_000, revenuNetMin: 8_080, perteRecharge: 6_144 },
  { id: "famille-lyg", name: "Famille LYG Printer", cost: 200_000, revenuNetMin: 8_700, perteRecharge: 4_802 },
  { id: "supreme", name: "Supreme Printer", cost: 1_000_000, revenuNetMin: 15_500, perteRecharge: 4_804 },
];

/** Revenu net par heure, ou null si le revenu/min est inconnu. */
export function revenuNetHeure(p: Pick<Printer, "revenuNetMin">): number | null {
  return p.revenuNetMin == null ? null : p.revenuNetMin * 60;
}

/** Temps de rentabilisation en minutes, ou null si le revenu/min est inconnu. */
export function paybackMinutes(p: Pick<Printer, "cost" | "revenuNetMin">): number | null {
  return p.revenuNetMin && p.revenuNetMin > 0 ? p.cost / p.revenuNetMin : null;
}

/** Un printer est "complet" si toutes ses données de calcul sont renseignées. */
export function isPrinterComplete(p: Printer): boolean {
  return p.revenuNetMin != null;
}
