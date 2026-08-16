# ⛔ Migrations Prisma — NE PAS lancer `migrate` ni `db push` sur la production

L'historique de migrations de cette base est **désynchronisé du dépôt**. Tant que
ce n'est pas assaini (chantier séparé, non planifié à ce jour), les commandes
suivantes sont **interdites** sur la base de production :

```
npx prisma migrate dev
npx prisma migrate deploy
npx prisma migrate reset
npx prisma db push
```

Seule commande sûre : **`npx prisma generate`** — elle régénère le client
TypeScript et ne touche jamais à la base.

---

## État constaté (10/08/2026)

| | |
|---|---|
| Lignes dans `_prisma_migrations` | 75 |
| Noms distincts | 73 |
| Dossiers dans `prisma/migrations/` | 23 |
| En base **sans** dossier sur disque | **52** |
| Sur disque **sans** ligne en base | **2** |
| Présentes des deux côtés | 21 |
| Lignes avec `finished_at IS NULL` | **2** |

### Les 52 migrations absentes du disque

Ce sont les plus anciennes (`20260118145326_init`, `add_member`,
`add_nextauth_models`…), datant de janvier 2026. Le dossier `prisma/migrations`
a été nettoyé sans que l'historique en base soit réinitialisé : la base a gardé
sa mémoire, le dépôt l'a perdue.

### Les 2 migrations sur disque non enregistrées

- `20260730020000_recruitment_messages`
- `20260803010000_member_rp_name_override`

Elles ont été **appliquées à la main en SQL**. Leur contenu est bien présent en
base (table `RecruitmentMessage`, colonne `Member.rpNameOverride` vérifiées),
seul l'enregistrement dans `_prisma_migrations` manque.

### Le point bloquant : 2 migrations en échec

`20260219050604_add_member_ghost_fields` est enregistrée **3 fois**, dont deux
avec `finished_at IS NULL`. Pour Prisma, cela signifie une migration en échec :

- `prisma migrate deploy` **refuse déjà de s'exécuter** sur cette base ;
- `prisma migrate dev` proposerait une **réinitialisation** — c'est-à-dire la
  perte de la production.

L'outil de migration est donc, en pratique, déjà hors service.

---

## Comment modifier le schéma en attendant

1. Écrire le SQL **à la main**, dans une transaction (`BEGIN` / `COMMIT`).
   Pour une contrainte sur une grosse table, utiliser `NOT VALID` puis
   `VALIDATE CONSTRAINT` afin de ne pas verrouiller la table pendant la
   vérification.
2. Répercuter le changement dans `prisma/schema.prisma` pour que le schéma et
   la base racontent la même histoire. **Sans cette étape**, un futur
   `db push` considérerait l'objet comme « en trop » et le supprimerait.
3. Lancer **`npx prisma generate`** — et rien d'autre.
4. Sauvegarder avant toute opération : `pg_dump` de la ou des tables touchées.

## Ce que le déploiement fait aujourd'hui

Vérifié : `npm run build` se limite à `rm -rf .next && next build`. Il n'y a
**aucun `postinstall`**, et aucune commande Prisma dans la chaîne de
déploiement. Le risque de perdre un objet créé en SQL n'est donc pas
automatique — il n'existe que si quelqu'un lance `migrate` ou `db push` à la
main. D'où ce document.

## Assainissement (non fait, à planifier)

Le chantier consisterait à : marquer les 2 lignes en échec comme résolues,
enregistrer les 2 migrations appliquées manuellement, et poser une baseline
pour les 52 disparues. À faire **avec sauvegarde complète et procédure
dédiée** — ce n'est pas une opération à improviser.
