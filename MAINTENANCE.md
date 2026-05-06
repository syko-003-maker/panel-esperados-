# Notes de maintenance — Los Esperados

Ce fichier liste les divergences connues entre le code et l'infrastructure
qu'il faut garder en tête lors d'une intervention. Lis-le avant tout
`npx prisma migrate ...` ou tout pull majeur.

## Index Prisma appliqué hors migration officielle

**Date** : 2026-05-06 (Lot 2 perf)
**Index** : `Sanction_familyId_discordStatus_idx` sur `Sanction(familyId, discordStatus)`
**Cause** : la shadow DB Prisma a un historique cassé préexistant
(`P3006 / P1014` sur `20260219050604_add_member_ghost_fields`), donc
`prisma migrate dev` refuse de générer la nouvelle migration.

**Application** :
```sql
CREATE INDEX IF NOT EXISTS "Sanction_familyId_discordStatus_idx"
  ON "Sanction"("familyId", "discordStatus");
```

**État actuel** :
- ✅ Index présent en DB de production (vérifié avec `\di`)
- ✅ Schéma Prisma déclare `@@index([familyId, discordStatus])`
- ⚠️ Aucun fichier dans `prisma/migrations/` ne mentionne cet index

**Conséquence** : sur un `prisma migrate dev` ou `migrate diff`, Prisma va
détecter une "drift" (l'index existe en DB mais pas dans l'historique).
Ne PAS exécuter ces commandes sans plan.

**Solution propre future** (lot dette à part) :
1. Auditer la migration cassée `20260219050604_add_member_ghost_fields`
2. Soit la corriger pour qu'elle s'applique sur shadow DB
3. Soit utiliser `prisma migrate resolve --rolled-back` puis baseliner
4. Une fois la baseline propre, `prisma migrate dev --name add_sanction_familyid_discordstatus_index` recréera la migration officielle
5. Vérifier `prisma migrate status` retourne "Database schema is up to date"

En attendant, garder cette note à jour si d'autres index/colonnes sont
ajoutés directement en SQL.

## Backups

Cf. `RESTORE.md` pour la procédure complète. Rétention :
- PostgreSQL : 14 jours, daily 03:00 UTC
- `.env` chiffrés : 7 jours, daily 03:15 UTC
- Passphrase GPG : `/home/ubuntu/.panel-backup-passphrase` (mode 600).
  À sauvegarder dans un password manager — irrécupérable sinon.

## Services systemd

Le panel ne tourne PAS via `pm2`. Il tourne via :
- `panel-esperados.service` (Next.js sur :3000)
- `discord-worker.service` (worker Discord sur :3001)

Le process `kitty-gang` dans pm2 est un projet SÉPARÉ — ne pas y toucher.

Pour redémarrer :
```bash
sudo systemctl restart panel-esperados.service
sudo systemctl restart discord-worker.service
```
