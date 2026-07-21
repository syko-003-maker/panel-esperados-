import { GRADE_LABEL_BY_ROLE_ID, GRADE_ROLE_IDS_ORDERED } from "@/lib/grade-colors";

// Client-safe (aucune dépendance serveur) : réutilisable côté UI ET serveur.
export const CHEF_FAMILLE_ROLE_ID = "1429607761720770623";
const RESERVISTE_ROLE_ID = "1312845999366209682";
const NUTELLA_ROLE_ID = "1465415073425133598";

/**
 * Grades assignables via l'outil « Changer le grade » : toute la hiérarchie
 * SAUF Chef famille (spécial), Réserviste (sanction) et Nutella (amis).
 * Ordonnés du plus haut au plus bas.
 */
export const ASSIGNABLE_GRADE_ROLE_IDS: string[] = GRADE_ROLE_IDS_ORDERED.filter(
  (id) => id !== CHEF_FAMILLE_ROLE_ID && id !== RESERVISTE_ROLE_ID && id !== NUTELLA_ROLE_ID,
);

/** [{ roleId, label }] pour un menu déroulant. */
export const ASSIGNABLE_GRADES: Array<{ roleId: string; label: string }> = ASSIGNABLE_GRADE_ROLE_IDS.map(
  (roleId) => ({ roleId, label: GRADE_LABEL_BY_ROLE_ID[roleId] ?? roleId }),
);
