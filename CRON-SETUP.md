## 🔧 Configuration Discord Auto-Sync Cron

### ✅ Fichiers créés:
- `app/api/cron/discord-sync/route.ts` - Endpoint protégé pour sync automatique
- `vercel.json` - Configuration Vercel Crons (toutes les 30 minutes)

### 📋 Setup Instructions

#### 1. Configurer la variable d'environnement

Ajouter à `.env.production` ou `.env.prod`:
```bash
CRON_SECRET=<generate-a-strong-random-string>
```

Example pour générer:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

#### 2. Vérifier le déploiement sur Vercel

```bash
# Si sur Vercel
vercel env ls
vercel env pull  # Récupérer les vars depuis Vercel
```

Ajouter `CRON_SECRET` dans les settings Vercel:
- Aller à https://vercel.com/dashboard/[project]/settings/environment-variables
- Add: `CRON_SECRET` = [valeur générée]

#### 3. Tester localement

```bash
# Démarrer le serveur dev
npm run dev

# Dans un autre terminal, tester l'endpoint:
curl -X POST http://localhost:3000/api/cron/discord-sync \
  -H "Authorization: Bearer <CRON_SECRET>" \
  -H "Content-Type: application/json"

# Réponse attendue:
{
  "status": "success",
  "message": "Discord sync completed",
  "totalMembers": 42,
  "synced": 42,
  "errors": 0,
  "batches": 1,
  "durationMs": 1234,
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

### 🔄 How it works

1. **Vercel Crons** appelle `POST /api/cron/discord-sync` automatiquement.
2. **Endpoint vérifie**: 
   - Request header: `Authorization: Bearer ${CRON_SECRET}`
   - Reject si absent ou incorrect (401 Unauthorized)
3. **Processus de sync**:
   - Fetch tous les members avec `discordId` 
   - Batch par 50 members (balance entre API Discord + LYG rate limits)
   - Appel `batchFetchDiscordMembers()` pour chaque batch
   - Update DB: `discordInGuild`, `discordRoleIds`, `discordFetchedAt`
4. **Logs détaillés** via `logger.info()` - utile pour debug Vercel logs

### 📊 Rate Limit Impact

- **Discord API**: 50 reqs/sec - batch de 50 ids prend ~1sec, bien OK
- **LYG API**: 150 reqs/15min - 1 sync auto = ~1-5 reqs (dépend batch count), OK
- **Total**: 1 sync par 30min = ~0.05 req/min LYG, bien under-budget

### 📈 Monitoring

Logs Vercel (Settings > Logs):
```
[discord-sync-cron] Starting Discord member status sync
[discord-sync-cron] Found 42 members to sync
[discord-sync-cron] Processing 1 batches of 50 members
[discord-sync-cron] Completed in 1234ms. Synced: 42/42, Errors: 0
```

### 🧪 Test sur Vercel (Production)

Une fois déployé sur Vercel:
```bash
# Tester manuellement via curl (production URL)
curl -X POST https://your-domain.com/api/cron/discord-sync \
  -H "Authorization: Bearer <CRON_SECRET>"
```

Vercel affichera l'invocation dans Logs > Crons.

### ❌ Troubleshooting

| Erreur | Cause | Solution |
|--------|-------|----------|
| 401 Unauthorized | CRON_SECRET bad/missing | Vérifier env var sur Vercel |
| 500 Internal Error | Erreur DB/Discord | Regarder logs Discord + Prisma |
| No cron runs | vercel.json pas déployé | Commit & push vercel.json |
| Timeout (>60s) | Too many members | Reduce batch size to 25-30 |

### 🎯 Next Steps (Optional)

- [ ] Monitor cron runs dans Vercel dashboard
- [ ] Alert si cron fails 3x de suite (setup webhook Discord)
- [ ] Add cleanup job pour old DiscordSnapshot entries (>24h)
- [ ] Reduce CONCURRENCY to 1 if Discord rate limits hit often

