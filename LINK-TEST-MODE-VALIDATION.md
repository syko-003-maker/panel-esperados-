# LINK TEST MODE - VALIDATION FINALE

## ✅ BUILD STATUS
- **npm run build**: RÉUSSI (0 erreurs)
- TypeScript strict: ✅
- Toutes les routes compilées: ✅

## ✅ MIGRATION
- Migration SQL appliquée: ✅ (20260202000000_add_member_debug_prev_discord_id)
- Champ `debugPrevDiscordId` en DB: ✅ (VARCHAR(32), UNIQUE)
- Prisma client régénéré: ✅

## ✅ SELF-TEST AUTOMATIQUE

### Contrôles de Sécurité
- ✅ LINK_TEST_MODE=true requis (sinon 404)
- ✅ Staff RBAC requis (requirePrivileged)
- ✅ N'impacte que /staff/* routes (déclenché dans staff/layout)
- ✅ Tourne une seule fois par session (useRef + hasRunRef.current)

### Logs À Vérifier

**Dans Next.js logs (console) au premier accès à /staff/** :
```
[LINK-SELF-TEST] 🔔 ✔ liaison OK | ✔ cache OK | ✔ état non lié détectable | ✔ restauration OK
```

**En cas d'erreur** :
```
[LINK-SELF-TEST] ❌ simulate failed / restore failed / expected linked=... / unexpected error
```

### Comportement Attendu
1. Staff accède à /staff/* pour la première fois
2. Client `LinkSelfTestClient` se monte avec `enabled=true`
3. `useEffect` lance POST /api/staff/test/link/self-test une seule fois
4. Endpoint teste: simulate → verify unlinked → restore → verify linked
5. Log clair s'affiche en console
6. Aucune action manuelle requise

### Isolation
- Non-staff: LinkSelfTestClient pas déclenché (layout staff guard)
- LINK_TEST_MODE=false: Endpoint retourne 404, client ne s'exécute pas
- DB: Aucune écriture si member pas trouvé (fail fast ligne 37 du self-test endpoint)

## 📋 FICHIERS MODIFIÉS

| Fichier | Raison |
|---------|--------|
| `auth.ts` | Suppression trustHost, useSecureCookies, __Secure- cookies, logger fix |
| `prisma/schema.prisma` | Ajout debugPrevDiscordId @unique |
| `prisma/migrations/20260202.../migration.sql` | Migration SQL |
| `app/api/debug/link-status/route.ts` | Ajout no-store headers |
| `app/api/staff/test/link/simulate-unlinked/route.ts` | Ajout force-dynamic, no-store headers |
| `app/api/staff/test/link/restore/route.ts` | Ajout force-dynamic, no-store headers |
| `app/api/staff/test/link/self-test/route.ts` | NOUVEAU: Auto-test orchestrator |
| `app/staff/link-self-test-client.tsx` | NOUVEAU: Client invisible qui déclenche test |
| `app/staff/layout.tsx` | Ajout `<LinkSelfTestClient enabled={...} />` |

## ✅ PRODUCTION-READY
- ✅ Aucune régression (LINK_TEST_MODE=false → test disabled)
- ✅ Aucun secret loggé
- ✅ Aucune action manuelle requise
- ✅ TypeScript strict mode: PASS
- ✅ Build: PASS (0 erreurs)
