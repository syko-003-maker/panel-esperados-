# MEGA PATCH #10 — Roadmap

**Status**: 📋 PLANIFIÉ — Non commencé  
**Prérequis**: MEGA PATCH #9 déployé et stable

---

## Objectif Principal

Migrer les données Google Sheet vers la base de données pour éliminer la dépendance au sheet et permettre une gestion plus robuste des membres.

---

## 1. Migration Google Sheet → DB

### 1.1 Analyse du Sheet actuel

- [ ] Documenter les colonnes existantes
- [ ] Identifier les données critiques vs optionnelles
- [ ] Mapper les types de données

### 1.2 Modèle Prisma

```prisma
model Member {
  id            String   @id @default(cuid())
  familyId      String
  discordId     String   @unique
  rpName        String?
  grade         String?  // ou enum Grade
  steamId       String?
  joinedAt      DateTime?
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  
  family        Family   @relation(fields: [familyId], references: [id])
}
```

### 1.3 Script de migration

- [ ] Lire les données du Google Sheet
- [ ] Transformer au format DB
- [ ] Insérer avec upsert (par discordId)
- [ ] Valider les données migrées
- [ ] Garder le sheet en read-only comme backup

---

## 2. Backfill Members

### 2.1 Sources de données

1. Google Sheet (source principale)
2. Discord Guild Members (sync)
3. Tickets existants (authorDiscordId)

### 2.2 Processus

- [ ] Import initial depuis Sheet
- [ ] Sync avec les membres Discord actuels
- [ ] Créer entrées pour les auteurs de tickets sans Member

---

## 3. Mapping Grades → Roles

### 3.1 Définir les grades

```typescript
enum Grade {
  RECRUIT
  MEMBER
  VETERAN
  OFFICER
  CAPTAIN
  CHEF
}
```

### 3.2 Mapper aux rôles Discord

| Grade | Role ID | Permissions Panel |
|-------|---------|-------------------|
| RECRUIT | xxx | Aucune |
| MEMBER | xxx | Basiques |
| VETERAN | xxx | Basiques |
| OFFICER | xxx | Staff |
| CAPTAIN | xxx | Staff |
| CHEF | xxx | Admin |

### 3.3 Sync automatique

- [ ] Au login, vérifier les rôles Discord
- [ ] Mettre à jour le grade en DB si changement
- [ ] Ou : job périodique de sync

---

## 4. Scheduler Jobs

### 4.1 Jobs à implémenter

| Job | Fréquence | Description |
|-----|-----------|-------------|
| `sync-members` | 1x/jour | Sync Discord → DB |
| `activity-check` | 1x/semaine | Vérifier activité membres |
| `cleanup-old-tickets` | 1x/mois | Archiver vieux tickets |

### 4.2 Options d'implémentation

1. **Cron externe** (GitHub Actions, Vercel Cron)
2. **BullMQ** avec Redis
3. **Node-cron** dans le worker Discord

### 4.3 Structure

```typescript
// jobs/sync-members.ts
export async function syncMembers() {
  // 1. Fetch Discord guild members
  // 2. Upsert dans DB
  // 3. Log résultat
}
```

---

## 5. UI Améliorations

### 5.1 Page Members améliorée

- [ ] Liste paginée des membres
- [ ] Filtres par grade, activité
- [ ] Actions bulk (changer grade, etc.)

### 5.2 Dashboard amélioré

- [ ] Graphiques activité
- [ ] Historique des actions
- [ ] Alertes

---

## 6. Dépendances

### À installer

```bash
npm install google-auth-library googleapis  # Si lecture Sheet
npm install bullmq ioredis                   # Si scheduler avec BullMQ
```

### À configurer

- [ ] Credentials Google Service Account (si Sheet)
- [ ] Redis URL (si BullMQ)

---

## 7. Timeline Estimée

| Phase | Durée | Description |
|-------|-------|-------------|
| 1 | 2j | Analyse et modèle Prisma |
| 2 | 3j | Script migration + tests |
| 3 | 2j | Mapping grades |
| 4 | 3j | Scheduler jobs |
| 5 | 2j | UI améliorations |
| 6 | 2j | Tests E2E + déploiement |

**Total estimé**: ~2 semaines

---

## 8. Critères de Succès

- [ ] Plus de dépendance au Google Sheet pour les opérations courantes
- [ ] Membres synchronisés avec Discord
- [ ] Grades mappés aux permissions
- [ ] Jobs automatiques fonctionnels
- [ ] Pas de régression sur les fonctionnalités MP#9

---

## Notes

- Le Google Sheet peut être gardé en lecture seule comme backup
- La migration doit être réversible (garder les données originales)
- Prévoir un mode "dry run" pour les scripts
