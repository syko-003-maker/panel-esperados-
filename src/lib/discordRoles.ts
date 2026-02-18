export const DISCORD_ROLES = {
  LOS_ESPERADOS: "1312845999340781646", // rôle obligatoire pour accéder au site
  CHEF: "1429607761720770623",
  ETAT_MAJOR: "1408485178619330590",
  HAUT_GRADE: "1312845999366209683",
} as const;

export const PRIVILEGED_ROLES: string[] = [
  DISCORD_ROLES.CHEF,
  DISCORD_ROLES.ETAT_MAJOR,
  DISCORD_ROLES.HAUT_GRADE,
];

export function isLosEsperados(roles: string[] = []) {
  return roles.includes(DISCORD_ROLES.LOS_ESPERADOS);
}

export function isPrivileged(roles: string[] = []) {
  return roles.some((r) => PRIVILEGED_ROLES.includes(r));
}
