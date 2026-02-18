# MEGA PATCH #10 — Migration Google Sheet → DB

**Version**: `mega-patch-10`  
**Date**: 2026-01-20  
**Status**: ✅ IMPLEMENTED

---

## Scope

### Nouveau modèle de données

**Member** (amélioré):
- `grade` — Grade actuel (WL1, WL2, WL3, WL4, OFFICER, CAPTAIN, CHEF)
- `gradeLevel` — Niveau numérique pour le tri (1-7)
- `roleDiscordId` — ID du rôle Discord correspondant
- `isActive` — Membre actif ou non
- `joinedAt` — Date d'arrivée

**GradeHistory** (nouveau):
- Historique des changements de grade
- Source: MIGRATION, MEETING, MANUAL, SYNC
- Audit trail complet

**Meeting** (amélioré):
- `familyId` — Support multi-family
- `type` — Type de réunion (WL1, WL2, WL3, WL4, GENERAL, OTHER)

---

## Nouveaux endpoints

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/api/members` | GET | Liste des membres avec filtres |
| `/api/members` | POST | Créer/upsert un membre |
| `/api/members/[discordId]` | GET | Détail d'un membre |
| `/api/members/[discordId]` | PATCH | Modifier un membre |
| `/api/members/[discordId]` | DELETE | Désactiver un membre |

---

## Nouvelles pages staff

| Page | Description |
|------|-------------|
| `/staff/members` | Liste des membres avec filtres par grade |
| `/staff/members/[discordId]` | Détail membre avec historique grades |

---

## Migration Google Sheet

### Prérequis

1. Exporter le Google Sheet en CSV
2. Placer le fichier dans `data/members.csv`

### Format CSV attendu

Colonnes supportées (insensible à la casse):
- `discord`, `discordid`, `id discord` → Discord ID
- `steam`, `steamid`, `steam id`, `steam64` → Steam ID
- `rp`, `rpname`, `nom rp`, `pseudo` → Nom RP
- `age`, `âge` → Âge
- `grade`, `whitelist`, `wl` → Grade
- `joined`, `date`, `arrivée` → Date d'arrivée

### Exécution

```bash
# Test (dry run)
DRY_RUN=true npx ts-node scripts/migrate-sheet-to-db.ts

# Vraie migration
npx ts-node scripts/migrate-sheet-to-db.ts
```

### Validation

```bash
# Vérifier le nombre de membres
npx prisma studio
# Ouvrir la table Member
```

---

## Sync Discord Roles

### Configuration

Ajouter dans `discord-worker/.env`:

```env
# Activer la sync automatique
ROLE_SYNC_ENABLED=true

# Mapping grade -> role ID
DISCORD_ROLE_WL1=xxx
DISCORD_ROLE_WL2=xxx
DISCORD_ROLE_WL3=xxx
DISCORD_ROLE_WL4=xxx
DISCORD_ROLE_OFFICER=xxx
DISCORD_ROLE_CAPTAIN=xxx
DISCORD_ROLE_CHEF=xxx

# Rôles protégés (jamais supprimés)
DISCORD_PROTECTED_ROLES=xxx,yyy
```

### Fonctionnement

- Sync toutes les 5 minutes (configurable)
- Fetch les membres actifs depuis le panel
- Compare les rôles actuels avec le grade en DB
- Ajoute le rôle correspondant au grade
- Retire les autres rôles de grade (sauf protégés)

### Logs

```json
{"event":"sync_start","timestamp":"..."}
{"event":"sync_fetched","count":50,"timestamp":"..."}
{"event":"sync_role_updated","discordId":"xxx","grade":"WL2","added":["xxx"],"removed":["yyy"],"timestamp":"..."}
{"event":"sync_complete","total":50,"synced":3,"errors":0,"timestamp":"..."}
```

---

## Décommissionnement Google Sheet

Une fois la migration validée:

1. ❌ Retirer les credentials Google (`credentials.json`)
2. ❌ Supprimer le code Python gspread/oauth
3. ❌ Désactiver les crons Python
4. ❌ Révoquer les scopes Drive
5. ✅ Documenter "Sheet retired"

---

## Checklist déploiement

- [ ] Exporter Google Sheet en CSV
- [ ] Placer dans `data/members.csv`
- [ ] Exécuter migration en dry-run
- [ ] Exécuter vraie migration
- [ ] Vérifier données dans Prisma Studio
- [ ] Configurer les role IDs dans worker
- [ ] Activer `ROLE_SYNC_ENABLED=true`
- [ ] Tester la sync de rôles
- [ ] Vérifier les pages `/staff/members`
- [ ] Désactiver les anciens crons Sheet
