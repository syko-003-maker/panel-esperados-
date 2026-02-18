# MEGA PATCH #9 — Release Notes

**Version**: `mega-patch-9`  
**Date**: 2026-01-20  
**Status**: ✅ FROZEN — No breaking changes allowed

---

## Scope Terminé

### Discord Worker (standalone)

- ✅ Panneau Contact avec boutons Recrutement / Plainte
- ✅ Modales de création de tickets
- ✅ Création de threads (private avec fallback public)
- ✅ Boutons de fermeture staff
- ✅ Lock + archive à la fermeture
- ✅ Logs dans salon dédié
- ✅ Anti-spam (rate limit 30s + limite tickets ouverts)
- ✅ Event versioning (v1)
- ✅ Multi-family ready

### Panel Next.js

- ✅ Endpoint unique `/api/ingest/tickets`
- ✅ Page `/staff/diagnostics`
- ✅ Page `/staff/dashboard` avec compteurs
- ✅ Pages `/staff/recruitments` et `/staff/complaints-tickets`
- ✅ Pages détail avec lien Discord + bouton copier
- ✅ Endpoint `/api/admin/bootstrap`
- ✅ Endpoint `/api/health`

### Configuration

- ✅ Centralisée dans `src/lib/family.ts`
- ✅ Centralisée dans `src/lib/discord-config.ts`
- ✅ Support `FAMILY_ID` env-driven

---

## Hors Scope (MP#10+)

- ❌ Migration Google Sheet → DB
- ❌ Scheduler jobs automatiques
- ❌ Notifications push
- ❌ Historique complet des actions staff
- ❌ UI multi-family (dropdown)
- ❌ Traduction / i18n

---

## Breaking Changes Interdits

Jusqu'à MEGA PATCH #10, les changements suivants sont **interdits** :

1. Modifier le format des events ingest (version 1)
2. Changer la structure de `ticketKey` ou `threadId`
3. Renommer les custom IDs Discord
4. Modifier le schéma Prisma `Recruitment` ou `Complaint`
5. Changer les statuts (PENDING/ARCHIVED, OPEN/RESOLVED/REJECTED)

---

## Checklist Déploiement Prod

Voir `docs/prod-checklist.md`

---

## Tag Git

```bash
git tag -a mega-patch-9 -m "MEGA PATCH #9 - Discord Tickets System"
git push origin mega-patch-9
```

---

## Notes de Version

### Nouvelles fonctionnalités

- Système de tickets Discord complet (recrutement + plaintes)
- Worker Discord standalone avec hot-reload
- Anti-spam intelligent
- Dashboard staff avec métriques temps réel
- Page diagnostics pour troubleshooting

### Améliorations

- Configuration centralisée
- Logs JSON structurés
- Hard fail sur erreurs critiques
- Event versioning pour compatibilité future

### Corrections

- Fix Next.js 16 breaking changes (params Promise)
- Fix FK constraints (Family upsert)
- Fix type errors Prisma

---

## Fichiers Clés

| Fichier | Description |
|---------|-------------|
| `discord-worker/` | Worker Discord complet |
| `src/lib/family.ts` | Configuration famille centralisée |
| `src/lib/discord-config.ts` | Configuration Discord centralisée |
| `src/lib/tickets.ts` | Helpers tickets pour le panel |
| `app/api/ingest/tickets/` | Endpoint ingest unique |
| `app/staff/diagnostics/` | Page diagnostics staff |
| `app/staff/dashboard/` | Dashboard staff |
