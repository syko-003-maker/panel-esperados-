# 🚀 STEP-BY-STEP DEPLOYMENT GUIDE

## Avant de commencer

Vérifie les prérequis:
- [ ] Node.js installé: `node --version` (minimum v18)
- [ ] npm installé: `npm --version` (minimum v9)
- [ ] Windows PowerShell 5.1 ou supérieur
- [ ] Access au dossier `c:\panel-esperados\panel\`

---

## DÉPLOIEMENT EN PRODUCTION

### Étape 1: Préparer l'environnement

```powershell
# Navigue vers le dossier root
cd c:\panel-esperados\panel

# Vérifie que les fichiers .env.prod existent
Get-ChildItem -Filter ".env.prod" -Recurse
```

**Attendu**:
```
.env.prod (racine)
discord-worker\.env.prod
```

Si manquants: Le code les créera automatiquement au démarrage.

---

### Étape 2: Compiler le worker

```powershell
cd discord-worker
npm run build
```

**Attendu**: Aucune erreur TypeScript, compilation réussie en ~30s

**Si erreur**: Arrête ici et contacte l'équipe dev

---

### Étape 3: Démarrer la production COMPLÈTE

```powershell
# Retourne à la racine
cd ..

# Lance le démarrage complet
npm run start:prod
```

**Cela lance concurrently**:
- Next.js Panel (port 3000)
- Discord Worker
- Cloudflare Tunnel

---

### Étape 4: Vérifier les logs du WORKER

Attends 5-10 secondes et cherche dans les logs:

```
[ENV LOADER] Production mode - Loading from: ...
[ENV CHECK OK] {
  CONTACT_CHANNEL_ID: '1312846003627622524',
  TICKETS_PARENT_CHANNEL_ID: '1337799725662863380',
  TICKETS_LOGS_CHANNEL_ID: '1325618925303758858',
  ...
}
[WORKER BOT] Los Esperados#6743 <id>
{"event":"worker_ready","bot":"Los Esperados#6743",...}
{"event":"boot_complete",...}
```

✅ **Si tu vois ça**: Worker est OK. Va à l'étape 5.

❌ **Si tu vois une erreur**: Voir [Troubleshooting](#troubleshooting) en bas.

---

### Étape 5: Vérifier le Panel

```
Ouvre dans le navigateur: http://localhost:3000
```

**Attendu**:
- [ ] Page d'accueil du panel se charge
- [ ] Connexion Discord possible
- [ ] Pas d'erreurs JavaScript en console (F12)

---

### Étape 6: Vérifier Discord

```
1. Ouvre le serveur Discord: Los Esperados
2. Va au channel: #contact-panel
3. Tu devrais voir un message avec des boutons:
   - "Ouvrir Recrutement" ✅
   - "Ouvrir Réclamation" ✅
4. Clique sur un bouton
   - Un modal devrait s'ouvrir ✅
5. Remplis et soumet le modal
   - Tu devrais voir une confirmation ✅
```

Si tout ça fonctionne → **DÉPLOIEMENT RÉUSSI** 🎉

---

## DÉPLOIEMENT WORKER SEUL (Debug)

Si tu veux tester le worker sans le panel:

```powershell
cd c:\panel-esperados\panel\discord-worker
npm run build
npm run start
```

**Attendu**: Logs de boot (voir étape 4 ci-dessus) sans Next.js

---

## Troubleshooting

### ❌ Erreur: "Missing env: DISCORD_TOKEN"

**Cause**: Le token Discord manque

**Solution**:
1. Ouvre `c:\panel-esperados\panel\.env.prod`
2. Ajoute: `DISCORD_TOKEN=<token>`
3. Ouvre `c:\panel-esperados\panel\discord-worker\.env.prod`
4. Ajoute: `DISCORD_TOKEN=<token>`
5. Redémarre: `npm run start:prod`

---

### ❌ Erreur: "Critical channels not accessible"

**Cause**: Le bot n'a pas accès aux channels Discord

**Solution**:
1. Va sur Discord → Los Esperados server
2. Clique droit sur #contact-panel → Permissions
3. Cherche "Los Esperados" (bot)
4. Assure-toi que ces permissions sont ✅:
   - View Channel
   - Send Messages
   - Create Private Threads
   - Manage Threads
5. Redémarre: `npm run start:prod`

---

### ❌ Erreur: "Value 'undefined' is not snowflake"

**Cause**: Un channel ID est manquant ou invalide

**Solution**:
1. Vérifie `.env.prod` (racine) a:
   ```
   CONTACT_CHANNEL_ID=1312846003627622524
   TICKETS_PARENT_CHANNEL_ID=1337799725662863380
   TICKETS_LOGS_CHANNEL_ID=1325618925303758858
   ```
2. Vérifie `discord-worker/.env.prod` a les mêmes valeurs
3. Redémarre: `npm run start:prod`

---

### ❌ Pas de logs après npm run start:prod

**Cause**: Le output est mélangé entre 3 processus concurrents

**Solution**: Lance le worker seul
```powershell
cd discord-worker
npm run start
```

Les logs seront clairs et non mélangés.

---

### ❌ Panel crash avec "Next.js error"

**Cause**: Problème avec le panel Next.js (pas du worker)

**Solution**:
1. Arrête tout: `Ctrl+C`
2. Redémarre le panel seul:
   ```powershell
   npm run build
   npm run start
   ```
3. Si erreur: Demande à l'équipe dev

---

### ❌ Le worker démarre mais pas de interactions Discord

**Cause**: Les commandes slash ne sont pas enregistrées

**Solution**:
1. Attends 15-30 secondes après le boot
2. Va sur Discord
3. Tape `/` dans un channel
4. Cherche les commandes (syncroles, member, ticket, etc.)
5. Si elles n'apparaissent pas:
   - Redémarre le worker
   - Attends 30s
   - Retry

---

## Vérification Rapide (1 minute)

```powershell
# Lance et vérifie juste le worker
cd c:\panel-esperados\panel\discord-worker
npm run build
npm run start 2>&1 | Select-String -Pattern "ENV CHECK OK|worker_ready|boot_complete"
```

Si tu vois:
```
[ENV CHECK OK] {...}
worker_ready
boot_complete
```

→ Tout est bon ✅

---

## Rollback (Si tout casse)

```powershell
# 1. Arrête tout
Ctrl+C

# 2. Vérifie quelle version était ok
git log --oneline -5

# 3. Restaure la version précédente
git checkout <hash>

# 4. Redémarre
npm run start:prod
```

---

## Support & Escalation

**Si tu es bloqué après avoir suivi ce guide**:

1. Prends une capture d'écran des logs d'erreur
2. Note le timestamp exact
3. Envoie à l'équipe ops avec:
   - La commande que tu as exécutée
   - Les logs complets
   - Le troubleshooting que tu as tenté

---

## Success Criteria

Après déploiement, valide que:

- [ ] `npm run start:prod` se lance sans erreur
- [ ] Logs contient `[ENV CHECK OK]`
- [ ] Logs contient `worker_ready`
- [ ] Logs contient `boot_complete`
- [ ] Panel accessible sur http://localhost:3000
- [ ] Bot répond sur Discord
- [ ] Boutons Discord fonctionnent
- [ ] Modals s'ouvrent correctement
- [ ] Les submits enregistrent les données

**Si tous les points sont ✅**: DÉPLOIEMENT RÉUSSI 🎉

---

**Next Steps**:
- Vérifier les métriques en monitoring
- Surveiller les logs pour les erreurs
- Tester les workflows utilisateur complets
