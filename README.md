# Panel Esperados

Système d'administration complet pour la communauté RP **Los Esperados** (Garry's Mod).  
Gestion des membres, absences, sanctions, réunions, plaintes et intégration Discord — le tout sur une seule plateforme.

---

## ✨ Fonctionnalités

### 🖥️ Panel Web
| Module | Description |
|--------|-------------|
| **Membres** | Liste, recherche, filtres (actifs, inactifs...), détails, sync LYG API, liaison SteamID↔Discord |
| **Absences** | Workflow PENDING→APPROVED/REJECTED, justifications, notifications Discord embed, suppression auto du message Discord à expiration |
| **Sanctions** | 7 types (oral, léger, lourd, démote, réserviste, blacklist), sync rôles Discord |
| **Réunions** | Gestion hebdo, présences, décisions (UP/DEMOTE/WARN), finalisation automatique |
| **Plaintes** | Workflow complet, historique messages, noms RP affichés, liens sanctions |
| **Banque** | Logs LYG API, alertes dettes, cache automatique |
| **Recrutement** | Pipeline candidats, scoring, sync tickets Discord |
| **Activité** | Score playtime + réunions + absences, snapshots hebdo, alertes |
| **Audit** | Trace complète de toutes les actions (qui, quoi, quand) |

### 🤖 Bot Discord (remplace DraftBot + JohnBot)

#### 📋 Logs automatiques (salon dédié)
| Événement | Description |
|-----------|-------------|
| 📥 Membre rejoint | Nom, ID, âge du compte (⚠️ si < 7 jours) |
| 📤 Membre parti | Nom, ID, rôles, durée sur le serveur |
| 👢 Kick | Détecté via audit log, modérateur affiché |
| 🔨 Ban / ✅ Unban | Membre + raison |
| 🗑️ Message supprimé | Auteur, salon, contenu (pré-chargé au démarrage) |
| ✏️ Message modifié | Avant / après |
| 🔄 Rôles modifiés | Rôles ajoutés / retirés |
| 🔊 Vocal | Connexion / déconnexion / changement de salon |

#### 🛡️ Modération
| Commande | Description |
|----------|-------------|
| `/ban @user raison [jours]` | Bannir + DM au membre |
| `/kick @user raison` | Expulser + DM au membre |
| `/mute @user durée raison` | Timeout Discord + DM au membre |
| `/warn @user raison` | Avertissement en base de données + DM |
| `/warns @user` | Voir les 10 derniers avertissements |
| `/unwarn id` | Supprimer un avertissement par ID |
| `/clear N [@user]` | Supprimer N messages (filtre par membre optionnel) |

#### 🎭 Auto-rôle
- Quand un membre valide le règlement Discord Community → rôle **Citoyen(e) LYG** attribué automatiquement
- Commande `/reglement-post` pour (re)poster le message règlement avec bouton d'acceptation

#### 🛡️ Anti-spam (automatique)
| Protection | Déclencheur | Action |
|------------|-------------|--------|
| **Flood** | 5 messages en 3 secondes | Mute 5 min + suppression + log |
| **Mention spam** | 3+ mentions dans un message | Mute 10 min + suppression + log |
| **Lien non autorisé** | Lien hors whitelist | Mute 5 min + suppression + log |

Whitelist liens : discord.gg, discord.com, youtube.com, youtu.be, twitch.tv, tenor.com, giphy.com  
Les modérateurs (permission `Gérer les messages`) sont immunisés.

#### ⚙️ Autres commandes
| Commande | Description |
|----------|-------------|
| `/member @user` | Fiche membre (grade, activité, sanctions) |
| `/sanction @user` | Créer une sanction depuis Discord |
| `/bank [@user]` | Solde bancaire |
| `/activity` | Statut d'activité personnel |
| `/syncroles` | Synchroniser les rôles Discord |
| `/syncname discordId` | Resynchroniser le pseudo d'un membre |
| `/annonce-recrutement` | Poster l'annonce de recrutement |

---

## 🛠️ Stack technique

- **Framework** : Next.js (App Router) + React 19 + TypeScript
- **Base de données** : PostgreSQL + Prisma ORM
- **Authentification** : NextAuth.js (OAuth Discord)
- **UI** : Tailwind CSS 4 + Radix UI + Lucide Icons
- **Discord** : Discord.js 14 (worker séparé)
- **Infra** : VPS Ubuntu + Cloudflare Tunnel

---

## 🏗️ Architecture

```
panel/
├── app/
│   ├── staff/              # Pages staff (membres, absences, réunions...)
│   ├── (member)/           # Pages membres (absences perso, banque...)
│   └── api/                # Routes API (REST)
├── src/
│   ├── components/         # Composants React réutilisables
│   ├── lib/                # Services, utilitaires, logique métier
│   └── server/             # Auth, guards, rate limiting
├── discord-worker/
│   └── src/
│       ├── features/
│       │   ├── logs/       # Logs serveur + auto-rôle
│       │   ├── moderation/ # Commandes ban/kick/mute/warn/clear
│       │   └── reglement/  # Bouton acceptation règlement
│       └── index.ts        # Point d'entrée bot
└── prisma/                 # Schéma BDD + migrations (60+ modèles)
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

## 🔧 Configuration Discord (Developer Portal)

1. Créer une application + bot
2. Activer les intents **Privileged Gateway** :
   - ✅ Server Members Intent
   - ✅ Message Content Intent
3. Ajouter la redirect URI OAuth : `http://localhost:3000/api/auth/callback/discord`
4. Inviter le bot avec les permissions : `Administrator` (ou au minimum : Ban Members, Kick Members, Moderate Members, Manage Messages, Manage Roles, View Audit Log)

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

---

## 🐛 Problèmes fréquents

| Problème | Solution |
|----------|---------|
| ECONNREFUSED 3001 | Le Discord Worker n'est pas lancé |
| INGEST_SECRET missing | Vérifier le .env du panel et du worker |
| Session expirée après migration DB | Se déconnecter et se reconnecter |
| Rôles Discord non synchronisés | Appeler `/syncroles` dans Discord |
| Logs Discord vides | Vérifier que Message Content Intent est activé dans le Developer Portal |

---

## 📝 Notes de développement

- Les dates côté client → toujours envoyer en ISO 8601 (`toISOString()`)
- Les composants Prisma passés au client → sérialiser en JSON (Date → string)
- Pour OAuth en local → toujours utiliser `http://localhost:3000` (pas l'IP LAN)
- Le bot pré-charge les 100 derniers messages de chaque salon au démarrage (pour les logs de suppression)

---

## 👤 Auteur

Projet développé pour la communauté **Los Esperados** — Garry's Mod RP FR.

> Panel construit et maintenu par Syko.
