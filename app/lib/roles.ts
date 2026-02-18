export const ROLES = {
  CHEF: process.env.ROLE_CHEF!,
  ETAT_MAJOR: process.env.ROLE_ETAT_MAJOR!,
  HAUT_GRADE: process.env.ROLE_HAUT_GRADE!,
};

export const STAFF_ROLES = [
  ROLES.CHEF,
  ROLES.ETAT_MAJOR,
  ROLES.HAUT_GRADE,
];
