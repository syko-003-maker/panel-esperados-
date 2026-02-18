## 🎯 Stabilisation Discord + Auto-refresh Implementation Plan

### ✅ COMPLETED (Déjà livré)

#### A) Discord "indisponible" => Statut fiable + scalable
- **Infrastructure existante**: 
  - ✅ `src/lib/discord-batch-reliable.ts` - Cache TTL 10 min + rate limit handling + "last known good" fallback
  - ✅ `/api/discord/members-status` - Batch endpoint pour vérifier les statuts
  - ✅ `app/staff/members/page.tsx` - Affiche statuts depuis DB (discordInGuild + discordRoleIds)
  
- **Améliorations apportées**:
  - ✅ Logs améliorés dans `/api/discord/members-status` avec stats (ok/rateLimited/unavailable)
  - ✅ Logs enrichis dans `discord-batch-reliable.ts`:
    ```
    [discord-batch] Fetch complete {
      totalRequested: 42,
      fromCache: 38 (90%),
      fromLive: 4,
      stats: {
        ok: 3,
        rateLimited: 1,
        unavailable: 0,
        configMissing: 0
      }
    }
    ```
  - ✅ UI badges clairs:
    - "Non lié" = no discordId
    - "Actif" (vert) = in guild + valid role
    - "Sans rôle" (amber) = in guild, no role
    - "Hors serveur" (rouge) = not in guild
    - "Discord: non verifié (rate limit)" (slate) = unknown/rate_limit
    - "Discord indisponible" (slate) = API error

#### B) Auto-refresh Banklogs (UI 60s)
- **Fichiers modifiés**:
  - ✅ `src/lib/banklogs-cache.ts` - NEW: Cache TTL 60 secondes côté serveur
  - ✅ `app/api/banklogs/route.ts` - Intégré le cache:
    - Cache check avant DB query
    - Cache write après DB query
    - Logs: `[banklogs-cache] HIT` / `SET` / `CLEARED`
  - ✅ `app/staff/banklogs/page.tsx` - Auto-refresh ajouté:
    ```typescript
    // Auto-refresh every 60 seconds
    useEffect(() => {
      const interval = setInterval(() => {
        load().catch(() => {}); // Silent on error
      }, 60000);
      return () => clearInterval(interval);
    }, []);
    ```

**Résultat**: Banklogs UI refreshes automatically every 60s via client-side setInterval. Server caches for 60s to avoid repeated DB hits.

#### C) Logs Discord batch améliorés
- ✅ `/api/discord/members-status` retourne `stats` object avec:
  - `requested`: nombre d'ids demandées
  - `ok`: nombre de réussis
  - `rateLimited`: nombre de rate limit (RATE_LIMIT error code)
  - `unavailable`: nombre d'indisponible
  - `durationMs`: temps total
  
- ✅ `discord-batch-reliable.ts` logs incluent:
  - Cache hit rate (`${percent}%`)
  - Nombre de IDs fétchés en live vs cache
  - Stats détaillés par error code

---

### 🎯 TODO - POUR SYNC AUTOMATIQUE (Optionnel mais recommandé)

#### D) Worker/Cron pour sync automatique
**But**: Éviter que `/staff/members` affiche "Discord: non verifié" en masse en gardant les statuts à jour.

**Options** (à choisir):

**Option 1: Next.js API Route Polling (Simple, pas d'infra externe)**
```typescript
// app/api/cron/discord-sync/route.ts
// Protected avec header Authorization: Bearer CRON_SECRET
// Appelé externes par un cron (vercel crons, github actions, etc)

export async function POST(req: Request) {
  // Verify CRON_SECRET
  // 1. Fetch all members with discordId
  // 2. Batch them par 50
  // 3. Appeler batchFetchDiscordMembers()
  // 4. Stocker résultats dans DB (discordInGuild, discordRoleIds)
  // Toutes les 30 min
}
```

**Option 2: Vercel Crons (Recommandé si sur Vercel)**
```json
{
  "crons": [{
    "path": "/api/cron/discord-sync",
    "schedule": "0 */30 * * *"  // Every 30 minutes
  }]
}
```

**Option 3: External Job (type Bree, Bull, etc)**
- Besoin d'une queue Redis/externe
- Plus robuste pour production large-scale

**Implémentation suggérée**: Option 1 + Option 2 (Vercel Crons)

---

### 📊 Rate Limit Analysis

**Discord**: 50 requests/sec per bot token
- Current: max 3 requêtes concurrentes (CONCURRENCY = 3)
- **OK pour 100+ membres**: 100 ids ÷ 3 concurrence ÷ 50req/sec ≈ 0.67 secondes

**LYG**: 150 requests per 15 minutes (10 req/min)
- Members sync: 1 req par 30 min auto-sync => **OK**
- Banklogs: 1 req initially + auto-refresh client-side via cache => **OK**
- Total: <2 req/min moyenne => **Well under limit**

---

### 🔍 Diagnostics & Logs

**Pour debug "Discord indisponible"**, regarder:

1. Server logs Discord batch:
```
[discord-batch] request start { requestedIds: 42, ids: [...] }
[discord-batch] 429 Rate limit { discordId, retryAfter, retryCount }
[discord-batch] Using lastKnownGood for 429 { discordId }
[discord-batch] Fetch complete {
  totalRequested: 42,
  fromCache: 38,
  fromLive: 4,
  stats: { ok: 3, rateLimited: 1, ... }
}
```

2. API response includes `stats`:
```json
{
  "statuses": { ... },
  "stats": {
    "requested": 42,
    "ok": 41,
    "rateLimited": 1,
    "unavailable": 0,
    "durationMs": 1234
  }
}
```

3. Banklogs cache logs:
```
[banklogs-cache] HIT { page: 1, limit: 50, remaining: 45 }
[banklogs-cache] SET { page: 1, limit: 50, ttlSeconds: 60 }
```

---

### 📋 Checklist

- [x] Discord batch endpoint exists + logging improved
- [x] Banklogs cache TTL 60s implemented
- [x] Banklogs auto-refresh UI 60s implemented
- [x] Discord logs show clear stats + error codes
- [ ] (OPTIONAL) Cron/Worker for auto-sync Discord every 30 min
- [ ] (OPTIONAL) Cron/Worker for auto-update banklogs from LYG

---

### 💡 Next Steps if needed:

1. **If "Discord: non verifié" is still common**: Implement Option D (cron-based sync)
2. **If rate limits hit even with cache**: Reduce CONCURRENCY from 3 to 2
3. **If DB grows >500 members**: Add pagination to auto-sync (batch 50 at a time)
4. **Monitor**: Add metrics to track cache hit rate and rate limit occurrences

