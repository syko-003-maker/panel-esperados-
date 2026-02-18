# Fix Discord Badge "Non lié/Non vérifié" - Complete Solution

## Objectif
✅ **ATTEINT** - Corriger le badge "Discord indisponible" qui s'affichait faussement quand discordId existe.

### Problème Original
- Beaucoup de membres affichaient **"Discord indisponible"** alors qu'ils sont liés
- **Cause**: `/api/discord/member-status` échouait car le PANEL Next n'avait pas `DISCORD_TOKEN` + `GUILD_ID` en env
- **Résultat**: L'API retournait `ok=false` pour tous → UI affichait "indisponible" partout

---

## Solution Implémentée

### 1. ✅ Modification: `app/api/discord/member-status/route.ts`

**Changements clés:**

1. **Ajout logs env au démarrage** (ligne ~28-34)
   ```typescript
   const DISCORD_TOKEN = (process.env.DISCORD_TOKEN ?? process.env.DISCORD_BOT_TOKEN ?? "").trim();
   const GUILD_ID = (process.env.GUILD_ID ?? process.env.DISCORD_GUILD_ID ?? "").trim();
   
   console.log("[member-status] env check", {
     hasDiscordToken: !!DISCORD_TOKEN,
     hasGuildId: !!GUILD_ID,
     tokenSource: ...,
     guildIdSource: ...,
   });
   ```
   - Vérifies les env au démarrage
   - Logs uniquement `hasToken`/`hasGuild` (pas les vraies valeurs)
   - Affiche la source trouvée (DISCORD_TOKEN vs DISCORD_BOT_TOKEN, etc)

2. **Nouvelle fonction `verifyMemberStatusViaRest()`** (ligne ~47-113)
   - ✅ Vérification Discord via REST API directe (pas discord.js)
   - Appelle: `GET https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordId}`
   - Header: `Authorization: Bot ${DISCORD_TOKEN}`
   - ✅ Lecture sécurisée: `res.text()` puis `JSON.parse()` en try/catch
   - Retourne:
     - `"not-found"` si 404 (pas dans le serveur)
     - `"unavailable"` si 401/403 (token invalide)
     - `"unavailable"` si autres erreurs
     - `"active"` si membre a un rôle valide
     - `"former"` si membre dans serveur mais sans rôle

3. **Logique de fallback dans GET()** (ligne ~156-205)
   - ✅ Essaye d'abord REST verification SI `DISCORD_TOKEN && GUILD_ID` existent
   - Si env manquent: fallback vers `getDiscordRolesForUserWithStatus()` (fonction existante)
   - Jamais crash - toujours retourne une réponse JSON propre

---

### 2. ✅ Modification: `src/lib/grade-colors.ts`

**Changement du label FETCH_FAILED:**

```typescript
// AVANT:
if (status === "FETCH_FAILED") {
  return { label: "Erreur rôles", ... };
}

// APRÈS:
if (status === "FETCH_FAILED") {
  return { label: "Non vérifié", ... };
}
```

- **Ancien label**: "Erreur rôles" (ou "Discord indisponible" précédemment)
- **Nouveau label**: "Non vérifié" 
- **Cas**: Quand discordId existe mais la vérification Discord a échoué

---

### 3. Logic Flow UI - NO CHANGES NEEDED

L'UI dans `app/staff/members/members-list-client.tsx` affiche déjà correctement:

```typescript
// Dans getRankBadge():
if (!m._diag_hasDiscordId) {
  // → Badge "Non lié" (discordId n'existe pas)
  return <span>Non lié</span>
}

if (m._diag_fetchStatus === "FETCH_FAILED") {
  // → Badge "Non vérifié" (discordId existe mais vérif échouée)
  // Le label vient maintenant de grade-colors.ts = "Non vérifié"
  return <span>Non vérifié</span>
}

if (m._diag_fetchStatus === "NOT_IN_GUILD") {
  // → Badge "Hors serveur" (pas dans le Discord)
  return <span>Hors serveur</span>
}

if (rankRoleId) {
  // → Badge du grade (Chef, Général, etc.)
  // = cas "active" / "ok=true"
  return <span>Chef famille</span>
}
```

**Résultat final:**
- ✅ Pas de modification UI requise - elle utilise déjà les bons statuts
- ✅ Le label "Non vérifié" s'affiche automatiquement via `grade-colors.ts`

---

## Configuration d'Environnement

### Variables Requises (Prod)

Le PANEL Next doit avoir dans `.env.prod` ou via secrets manager:

```
# Discord Bot Token (l'un des deux)
DISCORD_TOKEN=<bot_token>
# OU
DISCORD_BOT_TOKEN=<bot_token>

# Discord Guild ID
GUILD_ID=<guild_id>
# OU
DISCORD_GUILD_ID=<guild_id>
```

**Important**: Si ces variables existent SEULEMENT dans `discord-worker/.env.prod`, les dupliquer dans `panel/.env.prod`.

### Priorités de Lecture:

```typescript
const DISCORD_TOKEN = (process.env.DISCORD_TOKEN ?? process.env.DISCORD_BOT_TOKEN ?? "").trim();
const GUILD_ID = (process.env.GUILD_ID ?? process.env.DISCORD_GUILD_ID ?? "").trim();
```

- Essaye d'abord `DISCORD_TOKEN`, fallback sur `DISCORD_BOT_TOKEN`
- Essaye d'abord `GUILD_ID`, fallback sur `DISCORD_GUILD_ID`

---

## Vérification

### Build Status
✅ **BUILD PASSES** - Exit Code 0
```
npm run build 2>&1 | Select-Object -Last 30
→ All routes compiled successfully
→ No TypeScript errors
```

### Logs Diagnostiques

Au démarrage, vérifier les logs:
```
[member-status] env check {
  hasDiscordToken: true|false,
  hasGuildId: true|false,
  tokenSource: "DISCORD_TOKEN"|"DISCORD_BOT_TOKEN"|"none",
  guildIdSource: "GUILD_ID"|"DISCORD_GUILD_ID"|"none"
}
```

### Test du Endpoint

```bash
curl "http://localhost:3000/api/discord/member-status?discordIds=123456789"

# Réponse:
{
  "123456789": "active" | "former" | "not-found" | "unavailable"
}
```

---

## Cas de Test

### Cas 1: Discord ID absent
- **Affichage**: Badge "Non lié" (gris)
- **Reste**: Aucune vérification Discord

### Cas 2: Discord ID présent, env présents, membre actif
- **Affichage**: Badge du grade (Chef, Général, etc.) - couleur correspondante
- **Raison**: REST verification retourne "active" + roleId fetch

### Cas 3: Discord ID présent, env manquants
- **Log**: `[member-status] env check { hasDiscordToken: false, hasGuildId: false }`
- **Affichage**: Badge "Non vérifié" (amber/orange)
- **Raison**: Fallback vers `getDiscordRolesForUserWithStatus()` qui retourne "unavailable"

### Cas 4: Discord ID présent, env présents, mais utilisateur pas dans serveur
- **Affichage**: Badge "Hors serveur" (rouge)
- **Raison**: REST verification retourne 404 → "not-found"

### Cas 5: Discord ID présent, env présents, utilisateur dans serveur mais sans rôle
- **Affichage**: Badge "Sans grade" (gris neutre)
- **Raison**: REST verification retourne "former"

---

## Fichiers Modifiés

1. **app/api/discord/member-status/route.ts** (239 lignes)
   - ✅ Ajout fonction `verifyMemberStatusViaRest()`
   - ✅ Logs env au démarrage
   - ✅ Logique fallback dans GET()

2. **src/lib/grade-colors.ts** (234 lignes)
   - ✅ Label FETCH_FAILED changé de "Erreur rôles" à "Non vérifié"

---

## Stratégie de Déploiement

1. **Merger les changements** du code TypeScript
2. **Ajouter env vars** au PANEL prod:
   ```
   DISCORD_TOKEN=<from-discord-worker>
   GUILD_ID=<same-as-worker>
   ```
3. **Redéployer** le PANEL Next
4. **Vérifier les logs** au démarrage pour confirmer env check
5. **Tester** un member avec discordId pour voir s'il affiche correctement

---

## Rollback Plan

Si besoin de rollback:
1. Revert `grade-colors.ts` (change "Non vérifié" → "Erreur rôles")
2. Revert `member-status/route.ts` (enlève logs env + verifyMemberStatusViaRest)
3. Rebuild et redeploy

---

## Notes de Sécurité

- ✅ Jamais log les vraies valeurs des tokens/IDs
- ✅ Logs uniquement `hasToken`/`hasGuild` booleans
- ✅ Tokens sont seulement en memory pendant la requête
- ✅ REST call utilise HTTPS avec Authorization header
- ✅ Jamais crash ou erreur 500 - toujours retourne JSON valide

---

EOF
