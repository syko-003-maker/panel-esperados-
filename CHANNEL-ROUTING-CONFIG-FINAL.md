# 📡 Configuration Définitive des Canaux Discord

## ✅ STATUT : CONFIGURATION COMPLÈTE

Tous les canaux Discord sont maintenant centralisés et automatiquement chargés. **Zéro action manuelle requise.**

---

## 📍 Canaux & IDs Fixes

| Fonction | Nom Variable | ID | But |
|----------|--------------|----|----|
| **Demandes de liaison** | `BOTS_FAMILLE_CHANNEL_ID` | `1452869229295698025` | Reçoit les demandes de liaison utilisateurs (panel → `/me` page) |
| **Logs de tickets** | `TICKETS_LOGS_CHANNEL_ID` | `1325618925303758858` | Reçoit les logs fermeture/clôture tickets (worker logs) |
| **Catégorie tickets** | `TICKETS_PARENT_CHANNEL_ID` | `1337799725662863380` | Catégorie parent pour créer les threads tickets |
| **Contact panel** | `CONTACT_CHANNEL_ID` | `1452869229295698025` | Unifié = BOTS_FAMILLE (pour simplifier legacy) |

**Guild ID:** `1312845998753710151`

---

## 🔄 Flux de Routage

### 1️⃣ Demandes de Liaison (Panel → Discord)
```
[Panel] /me page → Click "Demander liaison"
    ↓
[API] POST /api/contact/link-request
    ↓
[Discord] Message + Buttons → BOTS_FAMILLE_CHANNEL_ID (1452869229295698025)
    ↓
[Staff] @recruteur, @chef_famille, @etat_major voient la demande
```

**Fichiers impliqués:**
- `app/api/contact/link-request/route.ts` (ligne 17: `process.env.BOTS_FAMILLE_CHANNEL_ID`)
- `.env.prod` (ligne: `BOTS_FAMILLE_CHANNEL_ID=1452869229295698025`)

### 2️⃣ Logs de Tickets (Worker → Discord)
```
[Worker] Ticket fermé/clôturé
    ↓
[Code] Envoi log Discord
    ↓
[Discord] Message log → TICKETS_LOGS_CHANNEL_ID (1325618925303758858)
```

**Fichiers impliqués:**
- `discord-worker/src/tickets.ts` (logs vers TICKETS_LOGS_CHANNEL_ID)
- `discord-worker/.env.prod` (ligne: `TICKETS_LOGS_CHANNEL_ID=1325618925303758858`)

### 3️⃣ Création Tickets (Worker)
```
[Worker] Commande /ticket
    ↓
[Code] Crée thread sous catégorie
    ↓
[Discord] Thread créé sous TICKETS_PARENT_CHANNEL_ID (1337799725662863380)
```

**Fichiers impliqués:**
- `discord-worker/src/contactPanel.ts` (création threads)
- `discord-worker/.env.prod` (ligne: `TICKETS_PARENT_CHANNEL_ID=1337799725662863380`)

---

## 📝 Fichiers Modifiés

### 1. `.env.prod` (Racine)
```env
# 📡 Canaux Discord - Configuration Définitive
BOTS_FAMILLE_CHANNEL_ID=1452869229295698025        # Demandes de liaison
CONTACT_CHANNEL_ID=1452869229295698025              # Unifié avec BOTS_FAMILLE
TICKETS_PARENT_CHANNEL_ID=1337799725662863380      # Catégorie tickets
TICKETS_LOGS_CHANNEL_ID=1325618925303758858        # Logs tickets
```

### 2. `discord-worker/.env.prod`
```env
# 📡 Canaux Discord - Chargement Automatique depuis .env.prod racine
# Routage:
#   - Demandes liaison → BOTS_FAMILLE_CHANNEL_ID
#   - Logs tickets → TICKETS_LOGS_CHANNEL_ID  
#   - Tickets catégorie → TICKETS_PARENT_CHANNEL_ID

BOTS_FAMILLE_CHANNEL_ID=1452869229295698025
CONTACT_CHANNEL_ID=1452869229295698025
TICKETS_PARENT_CHANNEL_ID=1337799725662863380
TICKETS_LOGS_CHANNEL_ID=1325618925303758858
DISCORD_TOKEN=...
GUILD_ID=1312845998753710151
```

### 3. `discord-worker/src/index.ts`
- ✅ **FIXED_CHANNELS**: Contient tous les 4 IDs comme fallback
- ✅ **REQUIRED_ENV**: Inclut `BOTS_FAMILLE_CHANNEL_ID`
- ✅ **validateEnv()**: Affiche [ENV CHECK OK] avec tous les canaux
- ✅ **loadEnv()**: Charge depuis `.env.prod`, crée le fichier s'il manque, utilise FIXED_CHANNELS en fallback

### 4. `discord-worker/src/ids.ts`
- ✅ **Proxy switch**: Ajout case `"BOTS_FAMILLE_CHANNEL_ID"`
- ✅ **Dynamic access**: `IDS.BOTS_FAMILLE_CHANNEL_ID` disponible partout dans le worker

### 5. `app/api/contact/link-request/route.ts`
- ✅ **Ligne 17**: `const DISCORD_CHANNEL_ID = process.env.BOTS_FAMILLE_CHANNEL_ID;`
- ✅ **JSDoc**: "Messages routés vers: BOTS_FAMILLE_CHANNEL_ID, Logs routés vers: TICKETS_LOGS_CHANNEL_ID"

---

## 🔒 Mécanisme de Chargement (Zero-Touch)

### Priority Order:
1. **Variables d'env du système** → `process.env`
2. **Fichier `.env.prod` (discord-worker/)** → dotenv
3. **Fichier `.env.prod` (racine)** → dotenv (fallback worker)
4. **FIXED_CHANNELS** → Valeurs en dur en dernier recours

### Auto-création:
Si `.env.prod` (discord-worker) manque, `loadEnv()` le crée automatiquement avec:
- Tous les 4 canaux (BOTS_FAMILLE, TICKETS_LOGS, TICKETS_PARENT, CONTACT)
- DISCORD_TOKEN, GUILD_ID, INGEST_BASE_URL, INGEST_SECRET

### Validation:
Au boot, `validateEnv()` vérifie:
- ✅ DISCORD_TOKEN présent
- ✅ GUILD_ID valide
- ✅ **BOTS_FAMILLE_CHANNEL_ID présent**
- ✅ CONTACT_CHANNEL_ID présent
- ✅ TICKETS_PARENT_CHANNEL_ID présent
- ✅ TICKETS_LOGS_CHANNEL_ID présent

Log affiché:
```
[ENV CHECK OK] {
  BOTS_FAMILLE_CHANNEL_ID: '1452869229295698025',
  CONTACT_CHANNEL_ID: '1452869229295698025',
  TICKETS_PARENT_CHANNEL_ID: '1337799725662863380',
  TICKETS_LOGS_CHANNEL_ID: '1325618925303758858',
  DISCORD_TOKEN: 'LOADED',
  GUILD_ID: '1312845998753710151',
  INGEST_BASE_URL: 'https://losesperados.xyz',
  INGEST_SECRET: 'LOADED'
}
```

---

## 🚀 Déploiement

### Pour le Panel (Next.js):
```bash
npm run build  # ✅ Compilation réussie
npm start      # Produit chargera .env.prod automatiquement
```

### Pour le Worker:
```bash
cd discord-worker
npm run build  # ✅ TypeScript OK
npm run start  # Boot automatique avec chargement env
```

**Zéro configuration manuelle requise !**

---

## ✨ Points Clés

- ✅ **Pas de tokens exposés** - Tout via env vars
- ✅ **Pas d'action manuelle** - Auto-création .env et fallback
- ✅ **Pas de crashes** - Validation stricte au boot
- ✅ **Pas de confusion de canaux** - IDs explicitement nommés
- ✅ **Fallback robuste** - FIXED_CHANNELS en dernier recours
- ✅ **Logs détaillés** - [ENV CHECK OK] montre exactement ce qui s'est chargé
- ✅ **Compilation réussie** - Panel et Worker buildent sans erreurs

---

## 📋 Checklist Finalisation

- [x] Canaux IDs définis et constants
- [x] Variables env nommées explicitement (BOTS_FAMILLE_CHANNEL_ID, etc.)
- [x] `.env.prod` racine mise à jour
- [x] `discord-worker/.env.prod` mise à jour
- [x] Proxy IDS.ts complété
- [x] index.ts boot validation ajoutée
- [x] API `/api/contact/link-request` corrigée
- [x] Panel compilation réussie (npm run build ✅)
- [x] Worker boot vérifié (npm run start ✅)
- [x] Zéro action manuelle requise ✅

---

## 🎯 État Production

**PRÊT À DÉPLOYER** ✅

Tous les systèmes configurés automatiquement:
- Panel: Prêt (compilation OK)
- Worker: Prêt (boot OK, tous canaux accessibles)
- Env Management: Prêt (auto-création + fallback)
- Validation: Prêt ([ENV CHECK OK] logs affichés)

