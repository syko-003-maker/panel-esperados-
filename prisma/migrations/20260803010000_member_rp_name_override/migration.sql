-- Nom RP forcé depuis le panel.
--
-- Le sync LYG réécrit `rpName` depuis le jeu toutes les 45 s : un renommage
-- fait depuis le site était annulé avant même d'être visible. Ce champ garde
-- le nom voulu par le staff ; le sync le respecte au lieu de l'écraser.
--
-- NULL = on suit le nom du jeu (comportement par défaut, inchangé).
ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "rpNameOverride" TEXT;
