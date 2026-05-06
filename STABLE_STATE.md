# État stable du panel — 2026-05-06

Snapshot pris après les 5 lots de stabilisation. Sert de référence pour
quiconque reprend le projet : ce qui est en place, ce qui marche, ce qui
reste à faire.

---

## ✅ Vérifications passées (suite complète)

| Test | Résultat | Durée |
|---|---|---|
| `npx tsc --noEmit` | exit 0, 0 erreur TypeScript | 5s |
| `npm run test:run` | 5 fichiers, **82 tests passed** | < 1s |
| `npm run build` | Compiled successfully, 180 pages générées | 43s |
| `panel-esperados.service` | active (enabled), pid 3409555, 189 MB | depuis 07:31 UTC |
| `discord-worker.service` | active (enabled), pid 3400081, 150 MB | depuis 06:47 UTC |
| `panel-backup-postgres.timer` | next 03:00 UTC | tous les jours |
| `panel-backup-env.timer` | next 03:15 UTC | tous les jours |
| `panel-worker-watchdog.timer` | toutes les 2 min | actif |
| `systemctl --failed` | 0 unit failed | — |

## ✅ Health & monitoring

```bash
curl -s http://127.0.0.1:3000/api/health | jq
```
```json
{
  "ok": true,
  "db": true,
  "worker": {
    "alive": true,
    "http":      { "alive": true, "status": 200, "durationMs": 4 },
    "heartbeat": { "alive": true, "ageMs": 36210, "uptimeSec": 2820 }
  }
}
```

- Heartbeat worker écrit en DB : workerName=`discord-worker`, mémoire 184 MB
- Backup postgres : `panel_db_2026-05-06.dump` (1.1 MB), dernier OK 07:07 UTC
- Backup env : 2 fichiers `.gpg` AES-256, mode 600, dernier OK 06:50 UTC

## ✅ Sync LYG/Discord (mesuré sur 30 min)

| Sync | Intervalle | Hits 30 min | Statut |
|---|---|---|---|
| `BANKLOGS_AUTO_SYNC` | 5 min | **6 / 6** | tous 200 |
| `MEMBERS_AUTO_SYNC` | 5 min | **6 / 6** | tous 200 |
| `INFOS_AUTO_SYNC` | 1 h | normal | next ~50 min |
| `PLAYTIME_AUTO_SYNC` | 1 h | normal | next ~50 min |

Compteur "stalled" (alerte Discord après 5 cycles consécutifs) : **non déclenché**.

## ✅ Smoke test endpoints (passés)

**Routes protégées sans auth → 401 attendu :**
- `/api/cron/cleanup-cache` → 401 ✓
- `/api/cron/worker-watchdog` → 401 ✓
- `/api/discord/recruitment` (POST) → 401 ✓
- `/api/discord/complaint` (POST) → 401 ✓
- `/api/discord/role-jobs/worker` (POST) → 401 ✓

**Routes worker avec INGEST_SECRET → 400/404 attendu (auth OK) :**
- `/api/discord/recruitment/decide` → 400 ✓
- `/api/discord/complaint/decide` → 400 ✓
- `/api/discord/sanctions` → 400 ✓
- `/api/discord/member?discordId=…` → 404 ✓
- `/api/discord/ticket?ticketKey=…` → 404 ✓

**Routes cron avec CRON_SECRET → 200 attendu :**
- `/api/cron/cleanup-cache` → 200 ✓
- `/api/cron/worker-watchdog` → 200 ✓

**Pages staff sans cookie → 307 redirect login attendu :**
- 15/15 pages staff testées → toutes en 307 ✓

**Healthcheck public :**
- `/api/health` → 200 ✓
- worker `:3001/health` → 200 ✓

## ✅ Aucune erreur dans les logs

- `journalctl panel-esperados` (15 min) : aucune erreur réelle (un seul `Failed to find Server Action` après build = bénin, page rechargée résout)
- `journalctl discord-worker` (15 min) : aucune erreur

---

## 🆕 Mises à jour post-stabilisation

| Lot | Commit | État |
|---|---|---|
| Lot 6 hotfix (BANKLOGS stalled + memory watch) | `e38e349` | ✅ déployé, 0 stalled depuis fix |
| **Lot 7** — refactor `staff/members/route.ts` | `aa37d26` | ✅ validé, 661→163 L, +43 tests, smoke test 307 OK |
| **Lot 8** — refactor `banklogs/route.ts` | `8ee6555` | ✅ validé, 578→203 L, +41 tests |
| Lot 8 confirmation auto-sync réel | _ce commit_ | ✅ POST `/api/banklogs` 200 + shape OK ; auto-sync worker `/api/cron/banklogs-auto-sync` 6/6 = 200 sur 30 min ; total BankLog 11 675 (croît) |

## 📚 Lots livrés

| Lot | Commit | Effet |
|---|---|---|
| **Lot 3 — Backups + monitoring** | `f589356` | Backups DB + env quotidiens, watchdog systemd, Sentry worker (no-op si DSN absent), heartbeat DB, alertes Discord (fallback log si webhook absent) |
| **Lot 1 — UX quick wins** | `37a1ada` | 4 pages refondues au design system (`complaints-tickets/{liste,détail}`, `audit`, `members/import` ×2), `app/staff/loading.tsx` global, `getErrorMessage` helper |
| **Lot 2 — Performance** | `2f0e8fb` | Polling -3 à -6× (system 5s→30s, recruitment-detail 10s→30s, tickets 7s→25s), cache server 15s sur `/api/staff/system` + `/api/staff/members` (avec coalescing), sanctions findMany Member fusionné via include, index Prisma `Sanction(familyId, discordStatus)` |
| **Lot 4 — Tests fondations** | `4b12a5d` | Vitest config, 76 tests sur member-scope, rbac, errors, recruitment-scoring, banklog-time |
| **Lot 5 — Dette légère** | `772e5fb` | 12 fmtDate locaux centralisés vers `formatAppDate`/`formatAppDateOnly`, 32 `catch (err: any)` → `getErrorMessage(err: unknown)` dans 10 fichiers UI client, +6 tests |
| **Lot 6 — Stabilisation** | _ce commit_ | Documentation STABLE_STATE.md (référence de l'état actuel) |

Plus le commit initial des fixes early-session (sécurité critique 4 fix-open + open redirect + member-scope priorité blacklist) — `13ea750`.

---

## 🛠️ Commandes de vérification (quotidien / pre-deploy)

### Suite automatisée (pre-commit / CI)
```bash
cd /home/ubuntu/panel
npx tsc --noEmit && npm run test:run && npm run build
```

### État des services
```bash
sudo systemctl status panel-esperados.service discord-worker.service \
  panel-backup-postgres.timer panel-backup-env.timer panel-worker-watchdog.timer \
  --no-pager
```

### Health applicatif
```bash
curl -s http://127.0.0.1:3000/api/health | jq
curl -s http://127.0.0.1:3001/health | jq
```

### Backups
```bash
# Backups récents
ls -lhrt /home/ubuntu/backups/postgres/*.dump | tail -3
ls -lhrt /home/ubuntu/backups/env/*.gpg | tail -4

# Logs
tail -10 /home/ubuntu/backups/logs/backup-postgres.log
tail -10 /home/ubuntu/backups/logs/backup-env.log

# Lancer manuellement (test)
sudo systemctl start panel-backup-postgres.service
sudo systemctl start panel-backup-env.service
```

### Sync LYG/Discord
```bash
journalctl -u discord-worker.service --since "30 minutes ago" --no-pager \
  | grep "AUTO_SYNC.*ok"
```

### Recherche erreurs récentes
```bash
journalctl -u panel-esperados.service --since "1 hour ago" --no-pager \
  | grep -iE "error|fail|exception" | grep -v "discord-rbac\|Server Action"

journalctl -u discord-worker.service --since "1 hour ago" --no-pager \
  | grep -iE "error|fail|exception" | grep -v "DeprecationWarning"
```

### Watchdog manuel
```bash
CRON=$(grep "^CRON_SECRET=" /home/ubuntu/panel/.env.prod | cut -d= -f2)
curl -s -H "Authorization: Bearer $CRON" \
  http://127.0.0.1:3000/api/cron/worker-watchdog | jq
```

### Restore (procédure complète : `RESTORE.md`)

---

## ⚠️ Risques connus restants

### Infrastructure
| # | Risque | Sévérité | Mitigation actuelle | Fix futur |
|---|---|---|---|---|
| 1 | **Drift Prisma migration shadow DB** : index `Sanction_familyId_discordStatus_idx` appliqué via SQL direct (Lot 2) car `prisma migrate dev` cassé sur migration `20260219050604_add_member_ghost_fields` | Moyen (limite future migration) | Documenté `MAINTENANCE.md` ; index présent en prod | Lot dette dédié : auditer + rebaseliner |
| 2 | **Aucun off-site backup** : tous les backups sont sur le même VPS qu'on backup | Moyen | Backups locaux quotidiens + rétention 14j | Push rsync vers OVH Object Storage / autre VPS |
| 3 | **Passphrase GPG** locale uniquement | Moyen (irrécupérable si VPS perdu) | `cat /home/ubuntu/.panel-backup-passphrase` à sauvegarder dans password manager (rappel donné) | Stockage off-site (Bitwarden / 1Password / coffre OVH) — manuel staff |
| 4 | **`DISCORD_ALERT_WEBHOOK_URL` non configuré** | Faible | Fallback log JSON only (alertes loguées sans crash) | Créer salon Discord `#staff-alerts` + URL |
| 5 | **`SENTRY_DSN` worker non configuré** | Faible | Init no-op (worker boot normalement) | Créer projet Sentry pour le worker |
| 6 | **kitty-gang pm2 process orphelin** sur la même machine | Faible | Aucune (process séparé, ne touche pas le panel) | À nettoyer/désinstaller si pas utile |

### Code
| # | Risque | Sévérité | Mitigation | Fix futur |
|---|---|---|---|---|
| 7 | **6 god-routes API > 500L** : `ingest/tickets` (711L), `staff/link/[discordId]` (696L), `staff/meetings/[id]` (694L), `finalize` (684L), `staff/members` (606L+cache), `banklogs` (578L) | Moyen | Code testé manuellement, sync prod OK | Lot 7 : split par domaine dans `src/lib/{domain}/` |
| 8 | **5 god-components > 700L** : `meeting-decisions` (1429L), `absences` (978L), `activity` (838L), `meeting-sheet` (731L), `sanctions-client` (~700L) | Moyen | Pas de bug constaté actuellement | Lot 8 : split en sous-composants + custom hooks |
| 9 | **80+ `catch (err: any)` restants** dans les routes API et god-components | Faible | Logger server-side cohérent + helper `getErrorMessage` dispo | Refacto en même temps que les god-* (lots 7-8) |
| 10 | **Doublons** : `discord-rbac.ts` vs `discord-rbac-enhanced.ts`, `Badge.tsx` vs `badge-new.tsx`, `timeline-client.tsx` vs `TimelineClient.tsx`, `complaints/` vs `complaints-tickets/` | Faible | Coexistent sans conflit | Lot dette : audit canonique + suppression |
| 11 | **`ComplaintsListClient` dormant** | Faible (175L mortes) | Documenté `MAINTENANCE.md` | Suppression après confirmation des liens Discord |
| 12 | **Routes API sans tests d'intégration** | Faible (logique pure testée) | Tests unitaires sur les fonctions internes critiques | Lot futur : tests d'intégration avec DB de test isolée |

---

## 🎯 Prochaine étape recommandée

**Option A — Refactor god-routes (Lot 7)**
Cible : les 6 god-routes API. Approche par fichier dans une branche dédiée :
1. Commencer par `staff/members/route.ts` (606L, le moins risqué — pas de path Discord critique)
2. Extraire la logique business dans `src/lib/members/{builder, scope-filter, response-cache}.ts`
3. Tests : la route doit toujours répondre identiquement (test d'intégration manuel + smoke tests existants)
4. Itérer fichier par fichier — `ingest/tickets` à faire en dernier (path critique Discord)

Effort : ~2-3 demi-journées par god-route, ~6 god-routes = 6-9 demi-journées étalées.

**Option B — Refactor god-components (Lot 8)**
Cible : les 5 god-components. Approche similaire :
1. Commencer par `sanctions-client.tsx` (~700L, déjà testé pour le scope sanction par les tests existants)
2. Extraire en sous-composants + custom hooks (`useSanctions`, `useSanctionForm`)
3. Tests : pas de DOM testing ici, mais le rendu visuel doit être identique (test manuel avec capture d'écran avant/après)

Effort : ~1-2 demi-journées par god-component, ~5 = 5-10 demi-journées.

**Option C — Tests d'intégration API**
Mettre en place une DB de test isolée + Vitest tests d'intégration sur les routes critiques (recruitment workflow, sanction workflow, plainte workflow). Sans toucher au code, on couvre les flows end-to-end.

**Recommandation personnelle** : **Option A** d'abord. Splitter les god-routes apporte plus de valeur immédiate (perf, lisibilité, sécurité) et le risque de régression est plus contenu (chaque route est indépendante).

---

## 🚦 Statut global : **STABLE**

Le panel est :
- ✅ **Sécurisé** (0 critique ouverte après les fix early-session + Lot 3)
- ✅ **Sauvegardé** (DB+env quotidien, restauration documentée dans `RESTORE.md`)
- ✅ **Monitoré** (healthcheck panel↔worker, watchdog 2 min, alertes Discord prêtes)
- ✅ **Performant** (caches server-side + polling rationalisé)
- ✅ **Testé** (82 tests unitaires, < 1s)
- ✅ **Cohérent** (helpers centralisés, design system appliqué)
- ⚠️ **Maintenable** (god-routes/components à refactor, mais isolés dans des lots futurs)

Aucune régression détectée. Aucun fichier `kitty-gang` touché.
