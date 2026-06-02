-- Famille WL : on stocke deux versions de chaque champ.
--   Réel  = ce que LYG renvoie actuellement (lecture seule, synchronisé)
--   Intent = ce que le chef veut, ne touche pas LYG directement
-- Le diff (intent != réel) sert d'aide-mémoire au chef pour appliquer sur
-- families.lyg.fr (l'API publique LYG n'a pas d'endpoint d'écriture).
ALTER TABLE "Member"
  ADD COLUMN "wlClass"            INTEGER,
  ADD COLUMN "wlOwner"            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "wlClassIntent"      INTEGER,
  ADD COLUMN "wlOwnerIntent"      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "wlIntentUpdatedAt"  TIMESTAMP(3),
  ADD COLUMN "wlIntentBy"         TEXT;
