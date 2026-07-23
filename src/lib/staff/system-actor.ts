/**
 * Compte technique « Système » — auteur des actions automatiques du panel.
 *
 * Pourquoi : une sanction exige un auteur (`Sanction.createdById` → `User`,
 * clé étrangère non nullable). Les sanctions posées par un automate (rappels
 * de dette, etc.) n'ont pas d'auteur humain. Les attribuer au Chef rendrait
 * l'historique disciplinaire trompeur — impossible de distinguer ce qu'un
 * humain a décidé de ce que le système a appliqué seul.
 *
 * Sécurité : ce compte n'a AUCUN compte OAuth associé (`User.accounts` vide).
 * La connexion se faisant exclusivement via Discord, personne ne peut s'y
 * authentifier. Il n'est ni staff ni chef.
 */
import { prisma } from "@/lib/db";

/** Domaine `.local` : jamais routable, aucun risque de collision avec un vrai mail. */
const SYSTEM_EMAIL = "system@losesperados.local";

/** Nom affiché dans le panel, les logs et les embeds Discord. */
export const SYSTEM_ACTOR_NAME = "Système";

// L'id ne change jamais une fois le compte créé : on évite une requête par appel.
let cachedId: string | null = null;

/**
 * Renvoie l'id du compte « Système », en le créant à la première utilisation.
 * Idempotent : l'unicité de l'e-mail garantit qu'un seul compte existe, même
 * en cas d'appels concurrents.
 */
export async function getSystemActorId(): Promise<string> {
  if (cachedId) return cachedId;

  const existing = await prisma.user.findUnique({
    where: { email: SYSTEM_EMAIL },
    select: { id: true },
  });

  if (existing) {
    cachedId = existing.id;
    return existing.id;
  }

  // upsert plutôt que create : si deux crons tombent en même temps au tout
  // premier usage, on ne veut pas d'erreur de contrainte d'unicité.
  const created = await prisma.user.upsert({
    where: { email: SYSTEM_EMAIL },
    update: {},
    create: { email: SYSTEM_EMAIL, name: SYSTEM_ACTOR_NAME },
    select: { id: true },
  });

  cachedId = created.id;
  return created.id;
}
