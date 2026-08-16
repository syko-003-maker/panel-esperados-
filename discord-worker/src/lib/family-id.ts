/**
 * Normalisation de l'identifiant de famille, côté worker.
 *
 * CONVENTION DU PROJET : `Family.id` (un cuid) est la seule valeur qui doit
 * atteindre la base. `Family.slug` ("esperados") est une valeur d'entrée.
 *
 * Équivalent worker de `toFamilyCuid()` du panel (`src/lib/family.ts`). Le
 * worker ne peut pas importer le module du panel (build et client Prisma
 * séparés), d'où ce doublon volontaire et minimal.
 */

const cache = new Map<string, string>();

export async function toFamilyCuid(prisma: any, input?: string | null): Promise<string> {
  const value = String(input ?? "").trim();
  if (!value) throw new Error("toFamilyCuid: identifiant de famille vide");

  const cached = cache.get(value);
  if (cached) return cached;

  // Déjà un cuid existant ? On ne touche à rien.
  const byId = await prisma.family.findUnique({ where: { id: value }, select: { id: true } });
  if (byId?.id) {
    cache.set(value, byId.id);
    return byId.id;
  }

  const bySlug = await prisma.family.findUnique({ where: { slug: value }, select: { id: true } });
  if (bySlug?.id) {
    cache.set(value, bySlug.id);
    return bySlug.id;
  }

  // Famille inconnue : on renvoie l'entrée telle quelle plutôt que d'inventer
  // une ligne Family. L'appelant échouera visiblement au lieu de créer un
  // second jeu de données fantôme — c'est exactement ce qu'on cherche à éviter.
  return value;
}
