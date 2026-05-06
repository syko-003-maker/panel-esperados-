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

## Code dormant (non supprimé volontairement)

### `app/staff/complaints-tickets/complaints-list-client.tsx`
Code complet, refondu au design system en Lot 1, **mais** `app/staff/complaints-tickets/page.tsx` redirect immédiatement vers `/staff/complaints` (autre composant). Le composant `ComplaintsListClient` n'est référencé que par sa propre déclaration. Aucun usage runtime.

Conservé car la page détail `/staff/complaints-tickets/[ticketKey]/...` reste linkée depuis Discord. À nettoyer dans un lot dette dédié si confirmation que rien ne pointe vers la liste racine.

## Variables d'env (référence)

| Variable | Défaut | Rôle |
|---|---|---|
| `INGEST_SECRET` | requis | Auth panel ↔ worker (header `x-ingest-secret`) |
| `CRON_SECRET` | requis | Auth des routes `/api/cron/*` (Bearer ou ?secret=) |
| `DISCORD_ALERT_WEBHOOK_URL` | vide | Webhook salon staff-alerts. Vide = log JSON only (fallback) |
| `SENTRY_DSN` (worker) | vide | Sentry worker. Vide = init no-op |
| `MEMORY_WATCH_MB` | `600` | Seuil au-dessus duquel le watchdog cron alerte panel/worker (lot 6 hotfix) |

## Helpers centralisés (lot 5)

- `formatAppDate(input)` — DD/MM/YYYY HH:MM (Bruxelles)
- `formatAppDateOnly(input)` — DD/MM/YYYY (date seule)
- `getErrorMessage(err: unknown): string` — extraction safe d'un message
  d'erreur depuis `Error | string | object | unknown`
- `toError(err: unknown): Error` — coercion vers Error pour Sentry/logs

Ne plus implémenter de `fmtDate` ou `catch (err: any) { String(err?.message ?? err) }` localement, utiliser ces helpers.

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
