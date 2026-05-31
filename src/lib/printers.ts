/**
 * Données des printers LYG pour le calculateur famille.
 *
 * Chaque printer est défini par 3 chiffres relevés EN JEU :
 *   - cost          : prix d'achat (boutique)
 *   - revenuBrutMin : production brute par minute (le « €/Min » affiché)   — null = à relever
 *   - rechargeCost  : coût d'UNE recharge (le bouton recharge)             — null = à relever
 *
 * Une recharge est nécessaire toutes les RECHARGE_INTERVAL_MIN minutes.
 *
 * Calculs dérivés :
 *   - coût de recharge / min = rechargeCost ÷ RECHARGE_INTERVAL_MIN
 *   - revenu NET / min       = revenuBrutMin − (coût de recharge / min)
 *   - revenu net / h         = revenu net/min × 60
 *   - temps de rentabilisation = cost ÷ revenu net/min
 *
 * ⚠️ Source : valeurs lues directement sur le printer en jeu (les chiffres de
 * l'ancien calculateur externe étaient faux). Pour compléter un modèle, pose-le
 * en jeu et relève la production/min + le coût de recharge.
 */

export type Printer = {
  id: string;
  name: string;
  /** Prix d'achat (boutique). Connu pour tous. */
  cost: number;
  /** Production brute par minute (« €/Min » en jeu). `null` = à relever. */
  revenuBrutMin: number | null;
  /** Coût d'une recharge (en jeu). `null` = à relever. */
  rechargeCost: number | null;
};

/** Une recharge est nécessaire toutes les 3,10 minutes. */
export const RECHARGE_INTERVAL_MIN = 3.1;

// Triés par prix croissant. Production + recharge connus uniquement pour les
// modèles relevés en jeu ; les autres restent à compléter (null).
export const PRINTERS: Printer[] = [
  { id: "bronze", name: "Bronze Printer", cost: 10_000, revenuBrutMin: 1_380, rechargeCost: 390 },
  { id: "argent", name: "Argent Printer", cost: 15_000, revenuBrutMin: 1_932, rechargeCost: 540 },
  { id: "or", name: "Or Printer", cost: 20_000, revenuBrutMin: 2_760, rechargeCost: 950 },
  { id: "platine", name: "Platine Printer", cost: 35_000, revenuBrutMin: 3_450, rechargeCost: 1_040 },
  { id: "diamant-vip", name: "Diamant VIP Printer", cost: 45_000, revenuBrutMin: 5_520, rechargeCost: 1_700 },
  { id: "titane-vip", name: "Titane VIP Printer", cost: 55_000, revenuBrutMin: 6_900, rechargeCost: 2_100 },
  { id: "amethyste-vip", name: "Amethyste VIP Printer", cost: 70_000, revenuBrutMin: 8_970, rechargeCost: 3_200 },
  { id: "emeraude-vip", name: "Emeraude VIP Printer", cost: 100_000, revenuBrutMin: 11_040, rechargeCost: 5_500 },
  { id: "saphyr-vip", name: "Saphyr VIP Printer", cost: 150_000, revenuBrutMin: 11_500, rechargeCost: 6_400 },
  { id: "famille-lyg", name: "Famille LYG Printer", cost: 200_000, revenuBrutMin: 11_730, rechargeCost: 5_000 },
  { id: "supreme", name: "Supreme Printer", cost: 1_000_000, revenuBrutMin: 19_550, rechargeCost: 5_000 },
];

/** Coût de recharge ramené à la minute, ou null si inconnu. */
export function rechargePerMin(p: Pick<Printer, "rechargeCost">): number | null {
  return p.rechargeCost == null ? null : p.rechargeCost / RECHARGE_INTERVAL_MIN;
}

/** Revenu NET par minute (brut − recharge/min), ou null si incomplet. */
export function revenuNetMin(p: Pick<Printer, "revenuBrutMin" | "rechargeCost">): number | null {
  if (p.revenuBrutMin == null) return null;
  const rpm = rechargePerMin(p);
  if (rpm == null) return null;
  return p.revenuBrutMin - rpm;
}

/** Revenu net par heure, ou null si incomplet. */
export function revenuNetHeure(p: Pick<Printer, "revenuBrutMin" | "rechargeCost">): number | null {
  const net = revenuNetMin(p);
  return net == null ? null : net * 60;
}

/** Temps de rentabilisation en minutes (coût ÷ revenu net/min), ou null. */
export function paybackMinutes(
  p: Pick<Printer, "cost" | "revenuBrutMin" | "rechargeCost">
): number | null {
  const net = revenuNetMin(p);
  return net && net > 0 ? p.cost / net : null;
}

/** Un printer est "complet" si production ET coût de recharge sont renseignés. */
export function isPrinterComplete(p: Printer): boolean {
  return p.revenuBrutMin != null && p.rechargeCost != null;
}
