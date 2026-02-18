# Sécurité MVP - Garde Actif & Niveau de Grade

## Résumé des modifications

Implémentation d'une sécurité minimale basée sur `Member.isActive` et `Member.gradeLevel` pour les routes API staff.

## Fichiers modifiés

### 1. `src/lib/guards.ts`
- **Ajout :** `GRADE_LEVELS` constant (exportée)
  - `MEMBER: 0` - Accès public
  - `STAFF: 10` - Personnel staff
  - `CHEF: 20` - Chef
- **Ajout :** `requireActiveMember(discordId, minGradeLevel)` async function
  - Vérifie que le membre est actif (`isActive === true`)
  - Vérifie que le `gradeLevel >= minGradeLevel` requis
  - Retourne `GuardResult` (soit Response 403, soit session OK)

### 2. `app/api/staff/sanctions/route.ts` (POST)
- Ajout du guard `requireActiveMember` avec `GRADE_LEVELS.STAFF`
- Vérifie que l'acteur est un membre actif avant de créer une sanction

### 3. `app/api/staff/sanctions/[id]/route.ts` (PATCH)
- Ajout du guard `requireActiveMember` avec `GRADE_LEVELS.STAFF`
- Vérifie que l'acteur est un membre actif avant de modifier une sanction

### 4. `app/api/staff/recruitment/[id]/decide/route.ts` (POST)
- Ajout du guard `requireActiveMember` avec `GRADE_LEVELS.STAFF`
- Vérifie que l'acteur est un membre actif avant de décider d'un recrutement

## Architecture

```
Authorization flow:
1. requirePrivileged() - Check NextAuth session + staff flag (existing)
2. requireActiveMember() - Check Member.isActive + Member.gradeLevel (NEW)
3. Route logic continues only if both guards pass
```

## Behavior

### Si Member.isActive === false
```json
{
  "status": 403,
  "body": { "ok": false, "error": "Member inactive" }
}
```

### Si Member.gradeLevel < required
```json
{
  "status": 403,
  "body": { "ok": false, "error": "Insufficient permissions" }
}
```

### Si discordId manquant
```json
{
  "status": 403,
  "body": null  // Simple 403
}
```

## Constraints respectées

- ✅ Pas de migration Prisma
- ✅ Pas de nouveau système d'auth
- ✅ Modifs minimales (guards only)
- ✅ Un seul helper réutilisable (`requireActiveMember`)
- ✅ Pas d'impact sur login
- ✅ Pas d'impact sur lecture publique (GET)
- ✅ Guards appliqués UNIQUEMENT sur POST/PATCH staff critiques

## Grade Levels recommandés

Basé sur la schema Member:
- `gradeLevel >= 0` = Membre normal (peut lire)
- `gradeLevel >= 10` = Staff (peut créer/modifier sanctions, tickets)
- `gradeLevel >= 20` = Chef (permissions additionnelles)

Adapter ces valeurs dans `GRADE_LEVELS` si nécessaire.
