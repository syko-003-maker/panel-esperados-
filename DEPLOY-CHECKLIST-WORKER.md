# 📋 CHECKLIST DÉPLOIEMENT PROD — Discord Worker

## Pre-Deployment Checks

### Environment Files
- [ ] `.env.prod` (root) existe et contient les 3 channel IDs:
  - CONTACT_CHANNEL_ID=1312846003627622524
  - TICKETS_PARENT_CHANNEL_ID=1337799725662863380
  - TICKETS_LOGS_CHANNEL_ID=1325618925303758858
- [ ] `discord-worker/.env.prod` existe avec les mêmes valeurs
- [ ] Les tokens Discord sont présents (DISCORD_TOKEN ou DISCORD_BOT_TOKEN)

### Code Changes
- [ ] `discord-worker/src/index.ts` a `loadEnv()` avec auto-creation
- [ ] `discord-worker/src/index.ts` a `validateEnv()` avec validation stricte
- [ ] Les valeurs FIXED_CHANNELS correspondent aux 3 channels critiques
- [ ] Pas de hardcoding de tokens dans le code

### Build Verification
```bash
cd discord-worker
npm run build
# ✅ Doit compiler sans erreur TypeScript
```

## Deployment Steps

### Option 1: Production complète
```powershell
cd c:\panel-esperados\panel\
npm run start:prod
```
Lance concurrently:
- Panel Next.js (port 3000)
- Discord worker
- Cloudflare Tunnel

### Option 2: Worker seul
```powershell
cd c:\panel-esperados\panel\discord-worker
npm run start
```

## Post-Deployment Validation

### Boot Logs (first 10 seconds)
Vérifier la présence de ces logs:

```
[ENV LOADER] Production mode - Loading from: ...
[ENV CHECK OK] {
  CONTACT_CHANNEL_ID: '1312846003627622524',
  TICKETS_PARENT_CHANNEL_ID: '1337799725662863380',
  TICKETS_LOGS_CHANNEL_ID: '1325618925303758858',
  ...
}
[WORKER BOT] Los Esperados#6743 <bot-id>
{"event":"worker_ready",...}
{"event":"contact_panel_ok",...}
{"event":"channel_access_ok","channel":"CONTACT",...}
{"event":"channel_access_ok","channel":"TICKETS_PARENT",...}
{"event":"channel_access_ok","channel":"TICKETS_LOGS",...}
{"event":"commands_register_ok",...}
{"event":"boot_complete",...}
```

### Critical Issues to Watch For
- ❌ **[ENV CHECK FAIL]** → Un ou plusieurs channel IDs manquent
- ❌ **boot_critical_failure** → Un channel critique n'est pas accessible
- ❌ **channel_access_failed (critical)** → Le bot ne peut pas accéder au channel
- ❌ **permission_warn** → Le bot manque de permissions sur un channel

### Testing Discord Interactions
1. Ouvrir le serveur Discord Los Esperados
2. Accéder au channel #contact-panel
3. Vérifier que le message du panel est présent
4. Cliquer sur un bouton (ex: "Ouvrir Recrutement")
5. Vérifier que le modal s'ouvre correctement

## Troubleshooting Fast Track

| Problème | Solution |
|----------|----------|
| "undefined is not snowflake" | Vérifier TICKETS_LOGS_CHANNEL_ID dans les deux .env.prod |
| "Critical channels not accessible" | Vérifier les permissions du bot sur les channels Discord |
| Worker ne démarre pas | Vérifier que DISCORD_TOKEN est valide |
| Pas de logs [ENV CHECK OK] | Relancer le worker après attente de 2s |

## Rollback Plan

Si le worker crash après le déploiement:

```powershell
# 1. Arrêter le processus
Stop-Process -Name node -Force

# 2. Vérifier les logs récents
# Chercher [ENV CHECK FAIL] ou boot_critical_failure

# 3. Si .env.prod a été modifié:
# - Restaurer depuis la sauvegarde
# - Ou laisser auto-creation recréer les fichiers

# 4. Relancer
npm run start:prod
```

## Performance Baseline

Temps de boot attendu: **3-5 secondes**

```
0.0s  - npm start
0.5s  - [ENV LOADER]
0.6s  - [ENV CHECK OK]
1.2s  - [WORKER BOT]
2.0s  - contact_panel_ok
3.0s  - boot_complete
```

## Monitoring & Alerts

### Logs to Monitor
- ✅ `worker_ready` → Worker started successfully
- ✅ `boot_complete` → Ready for interactions
- ⚠️ `panel_health_warn` → Panel unreachable (non-critical)
- ❌ `boot_critical_failure` → Must restart worker

### Recommended Monitoring
```bash
# Tail worker logs in real-time
npm run start:prod 2>&1 | grep -E "worker_ready|boot_complete|boot_error"

# Or in PowerShell
npm run start:prod 2>&1 | Select-String "worker_ready|boot_complete|boot_error"
```

## Security Checklist

- [ ] `.env.prod` files are in `.gitignore`
- [ ] No tokens hardcoded in source code
- [ ] Only ops/devops team can modify `.env.prod` files
- [ ] Discord bot token is rotated quarterly
- [ ] Ingest secret is stored securely
- [ ] No logs contain sensitive information

## Sign-Off

- **Deployed by**: _________________
- **Date**: _________________
- **Version**: _________________
- **Verified by**: _________________

---

**Last Updated**: 2026-01-31  
**Next Review**: 2026-03-31
