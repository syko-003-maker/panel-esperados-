/**
 * Mapping itemsRaw (Prisma) → items finaux pour la response /api/banklogs.
 * Pure : prend une row brute, retourne un row API formaté.
 *
 * Extrait de app/api/banklogs/route.ts (Lot 8).
 */

import { getMemberDisplayName } from "@/lib/member-display";
import { isDisplayableStaffMember } from "@/lib/staff/member-scope";
import type { BanklogRowRaw } from "./query-banklogs";

export interface BanklogRow {
  at: Date;
  type: number;
  money: number;
  steamId: string;
  rpName: string | null;
  isGhost: boolean;
}

/**
 * Filtre + map les rows brutes en BanklogRow.
 * - Conserve les rows sans member joint (memberId null) : affichées "Non lié"
 * - Drop les rows dont le member est joint mais non-displayable (sécurité doublon
 *   du SQL filter, en cas de SQL qui passerait au travers)
 * - Calcule `rpName` via getMemberDisplayName (priorité displayName Discord)
 */
export function buildBanklogRows(itemsRaw: BanklogRowRaw[]): BanklogRow[] {
  return itemsRaw
    .filter((item) => !item.memberId || isDisplayableStaffMember(item))
    .map((item) => {
      const hasMemberRow = Boolean(item.memberId);
      const isDisplayableMember = hasMemberRow && isDisplayableStaffMember(item);
      const resolvedName = isDisplayableMember ? getMemberDisplayName(item) : null;

      return {
        at: item.at,
        type: item.type,
        money: item.money,
        steamId: item.steamId,
        rpName: resolvedName,
        isGhost: Boolean(item.isGhost),
      };
    });
}

/**
 * Sérialise les rows pour la response JSON :
 * - at: Date → ISO string
 * - drop le flag interne isGhost (utilisé seulement pour le debug)
 */
export function serializeBanklogRows(
  rows: BanklogRow[]
): Array<{
  at: string;
  type: number;
  money: number;
  steamId: string;
  rpName: string | null;
}> {
  return rows.map((item) => ({
    at: item.at.toISOString(),
    type: item.type,
    money: item.money,
    steamId: item.steamId,
    rpName: item.rpName,
  }));
}

/**
 * Stats debug (DEBUG_BANKLOGS=1) — utilisé uniquement pour les logs verbose.
 */
export function computeDebugStats(itemsRaw: BanklogRowRaw[]): {
  ghostUsedCount: number;
  unlinkedCount: number;
  unlinkedSamples: BanklogRowRaw[];
} {
  const ghostUsedCount = itemsRaw.filter((i) => i.isGhost && !i.rpName).length;
  const unlinked = itemsRaw.filter((i) => !i.rpName && !i.isGhost);
  return {
    ghostUsedCount,
    unlinkedCount: unlinked.length,
    unlinkedSamples: unlinked.slice(0, 5),
  };
}
