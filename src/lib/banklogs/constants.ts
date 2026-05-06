/**
 * Constantes banklogs : slug famille forcé + paths LYG.
 * Forcé côté serveur — toute valeur d'UI/app est ignorée.
 *
 * Extrait de app/api/banklogs/route.ts (Lot 8).
 */

export const FAMILY_SLUG = "esperados";
export const FAMILY_NAME = "Los Esperados";

// LYG endpoints (cf doc /api/darkrp/familles/{name}/banklogs)
export const LYG_BANKLOGS_PATH = `/api/darkrp/familles/${encodeURIComponent(FAMILY_NAME)}/banklogs`;
export const LYG_MEMBERS_PATH = `/api/darkrp/familles/${FAMILY_SLUG}/members`;
