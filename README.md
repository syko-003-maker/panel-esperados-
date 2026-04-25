# Panel Esperados

Système d'administration complet pour la communauté RP **Los Esperados** (Garry's Mod).  
Gestion des membres, absences, sanctions, réunions, plaintes et intégration Discord — le tout sur une seule plateforme.

---

## ✨ Fonctionnalités

| Module | Description |
|--------|-------------|
| **Membres** | Liste, recherche, détails, sync LYG API, liaison SteamID↔Discord |
| **Absences** | Workflow PENDING→APPROVED/REJECTED, justifications, notifications Discord |
| **Sanctions** | 7 types (oral, léger, lourd, démote, réserviste, blacklist), sync rôles Discord |
| **Réunions** | Gestion hebdo, présences, décisions (UP/DEMOTE/WARN), finalisation automatique |
| **Plaintes** | Workflow complet, historique messages Discord, noms RP, liens sanctions |
| **Banque** | Logs LYG API, alertes dettes, cache automatique |
| **Recrutement** | Pipeline candidats, scoring, sync tickets Discord |
| **Activité** | Score playtime + réunions + absences, snapshots hebdo, alertes |
| **Audit** | Trace complète de toutes les actions (qui, quoi, quand) |
| **Discord Bot** | Notifications, rôles, slash commands, webhooks entrants |

---

## 🛠️ Stack technique

- **Framework** : Next.js (App Router) + React 19 + TypeScript
- **Base de données** : PostgreSQL + Prisma ORM
- **Authentification** : NextAuth.js (OAuth Discord)
- **UI** : Tailwind CSS 4 + Radix UI + Lucide Icons
- **Discord** : Discord.js 14 (worker séparé)
- **Monitoring** : Sentry
- **Infra** : VPS Ubuntu + Cloudflare Tunnel

---

## 🏗️ Architecture

```
panel/
├── app/
│   ├── staff/          # Pages staff (membres, absences, réunions...)
│   ├── (member)/       # Pages membres (absences perso, sanctions...)
│   └── api/            # Routes API (REST)
├── src/
│   ├── components/     # Composants React réutilisables
│   ├── lib/            # Services, utilitaires, logique métier
│   └── server/         # Auth, guards, rate limiting
├── discord-worker/     # Service Node.js Discord séparé
└── prisma/             # Schéma BDD + migrations (60+ modèles)
```

Deux services en production :
- **Panel** (port 3000) — site web Next.js
- **Discord Worker** (port 3001) — bot Discord + traitement queue

---

## 🚀 Installation

### Prérequis
- Node.js 18+
- PostgreSQL
- Un bot Discord configuré

### 1. Cloner le projet
```bash
git clone https://github.com/syko-003-maker/panel-esperados-.git
cd panel-esperados-
npm install
```

### 2. Configuration
Créer un fichier `.env.local` à la racine :
```env
DATABASE_URL="postgresql://user:password@localhost:5432/panel_db"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="votre_secret_nextauth"
DISCORD_CLIENT_ID="votre_client_id_discord"
DISCORD_CLIENT_SECRET="votre_client_secret_discord"
DISCORD_BOT_TOKEN="votre_token_bot"
INGEST_SECRET="votre_secret_partage"
WORKER_INTERNAL_URL="http://127.0.0.1:3001"
```

### 3. Base de données
```bash
npx prisma migrate deploy
npx prisma generate
```

### 4. Lancer en développement
```bash
# Panel
npm run dev

# Discord Worker (dans un autre terminal)
npm run discord:dev
```

---

## 🔧 Configuration Discord

Dans le Discord Developer Portal :
1. Créer une application + bot
2. Activer les intents : Server Members, Message Content
3. Ajouter la redirect URI OAuth : http://localhost:3000/api/auth/callback/discord
4. Inviter le bot sur le serveur avec les permissions nécessaires

---

## 🏭 Déploiement production

```bash
# Build
npm run build

# Démarrer le panel
npm run start

# Démarrer le worker Discord
npm run discord:start
```

Le site est exposé via Cloudflare Tunnel — aucun port n'est ouvert directement sur internet.

---

## 🔐 Sécurité

- Authentification Discord OAuth obligatoire
- RBAC (rôles + permissions granulaires) sur toutes les routes
- Fichiers .env jamais commités (.gitignore configuré)
- Base de données accessible uniquement en local (127.0.0.1)
- Ports 3000 et 3001 bloqués par le pare-feu (UFW)
- IP réelle cachée derrière Cloudflare

---

## 📡 Intégration Discord

Le panel utilise un système de queue fiable (DiscordOutbox) :

```
Panel → crée un job en DB → Discord Worker → exécute → Discord API
```

Chaque message/rôle passe par cette queue avec retry automatique en cas d'échec.

Channels configurés :
- Absences : 1335303582043607222
- Sanctions : 1409028569203740792

### Tester les notifications Discord
```bash
curl "http://localhost:3000/api/member/_test-discord?channel=absence"
```

---

## 🐛 Problèmes fréquents

| Problème | Solution |
|----------|---------|
| ECONNREFUSED 3001 | Le Discord Worker n'est pas lancé |
| INGEST_SECRET missing | Vérifier le .env du panel et du worker |
| Session expirée après migration DB | Se déconnecter et se reconnecter |
| Rôles Discord non synchronisés | Appeler /api/discord/resync |

---

## 📝 Notes de développement

- Les dates côté client → toujours envoyer en ISO 8601 (toISOString())
- Les composants Prisma passés au client → sérialiser en JSON (Date → string)
- Pour OAuth en local → toujours utiliser http://localhost:3000 (pas l'IP LAN)
- Le resync Discord tourne en cron toutes les 5 minutes

---

## 👤 Auteur

Projet développé pour la communauté **Los Esperados** — Garry's Mod RP FR.

> Panel construit et maintenu par Syko.
