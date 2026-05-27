# Panel Esperados

Système d'administration complet pour la communauté RP **Los Esperados** (Garry's Mod / DarkRP — serveur LiveYourGame).
Gestion des membres, absences, sanctions, réunions, plaintes, whitelist famille, recrutement et intégration Discord — le tout sur une seule plateforme.

---

## ✨ Fonctionnalités

### 🖥️ Panel Web

| Module | Description |
|--------|-------------|
| **Membres** | Liste avec filtres (actifs, inactifs, faible activité, top actifs, à surveiller, **en jeu live**), compteurs temps réel, statut connexion LYG, recherche, tri, fiche détaillée |
| **Famille WL** | Gestion des whitelists in-game LYG (rangs 1-5 + flag owner). **Mode planif** (intent stocké) ou **mode live** (modifs poussées en temps réel sur families.lyg.fr via cookie chiffré). Auto-add sur recrutement / auto-remove sur DEMOTE/BLACKLIST |
| **Warns in-game** | Liste des sanctions LYG (Warn / Jail / Ban) par membre, triées par date |
| **Absences** | Workflow PENDING→APPROVED/REJECTED. Type Réunion (dimanche dédié) ou Générale (période 2 mois max). Notifications Discord à la décision |
| **Sanctions** | 7 types (AVERT oral / léger / lourd / EM, DEMOTE, RÉSERVISTE, BLACKLIST). Sync rôles Discord + retrait WL famille auto sur DEMOTE/BLACKLIST |
| **Réunions** | Gestion hebdo, présences (auto + override manuel), décisions (UP / DOUBLE_UP / DEMOTE / WARN), finalisation avec sécurité grades protégés |
| **Plaintes** | Workflow complet, historique messages, décisions tranchées |
| **Banque** | Logs LYG bancaires, alertes dettes, statistiques |
| **Recrutement** | Pipeline candidats, scoring, sync tickets Discord, auto-add WL famille à la validation |
| **Stats / Dettes** | Dashboard analytique, top recrueurs, dettes membres avec rappel groupé Discord |
| **Activité** | Score playtime + réunions + absences, snapshots hebdo |
| **Audit** | Trace complète de toutes les actions (qui, quoi, quand, diff) |
| **Paramètres Système** | Configuration Discord, RBAC, templates messages, **cookie LYG admin chiffré** |

### 📱 Espace Membre

| Module | Description |
|--------|-------------|
| **Dashboard** | Solde bancaire (déficit / équilibre / positif) avec visuel coloré + glow, transactions récentes, infos compte |
| **Banque** | Historique complet des opérations LYG |
| **Justifier une absence** | Formulaire 2 modes : Réunion (dimanche pré-sélectionné) ou Générale (période). Envoi automatique sur Discord |
| **Justifier une sanction** | Formulaire avec sélecteur Warn / Jail / Ban + contexte + justification |
| **Recrutement** | Recruteurs : suivi des tickets en cours |

### 📖 Guides publics

Accessibles sans authentification, avec sidebar intégrée pour les membres connectés :
- `/guide/build` — Règles de construction (4 catégories, sévérités, exemples visuels)
- `/guide/negociation` — Spécialisation négociation (braquages, prises d'otages)
- `/guide/conduite` — Spécialisation conduite (règles, cartes, fiches voitures)
- `/jlg` — Page événement "Technique J.L.G" (concept printers collectif)

### 🤖 Bot Discord

#### 📋 Logs automatiques (salon dédié)
| Événement | Description |
|-----------|-------------|
| 📥 Membre rejoint | Nom, ID, âge du compte (⚠️ si < 7 jours) |
| 📤 Membre parti / 👢 Kick | Détection auto via audit log (modérateur + raison extraits) |
| 🔨 Ban / ✅ Unban | Membre + raison + auteur (audit log enrichi) |
| 🗑️ Message supprimé | Auteur, salon, contenu (cache préchargé au démarrage) |
| ✏️ Message modifié | Avant / après |
| 🔄 Rôles modifiés | Rôles ajoutés / retirés + auteur |
| 🔊 Vocal | Connexion / déconnexion / déplacement (détection auto modé) |
| ⚠️ **Warn in-game** | Nouveau warn LYG → embed avec raison, type, **barre de gravité visuelle** (●●●○○), avatar membre ou logo Los Esperados |
| 🛠️ **Commandes staff** | Trace `/annonce-recrutement`, `/linkpanel`, `/reglement-post` → embed audit + log DB |

#### 🛡️ Modération
| Commande | Description |
|----------|-------------|
| `/ban @user raison [jours]` | Bannir + DM au membre + log enrichi |
| `/kick @user raison` | Expulser + DM au membre |
| `/mute @user durée raison` | Timeout Discord + DM au membre |
| `/warn @user raison` | Avertissement DB + DM |
| `/warns @user` | Voir les 10 derniers avertissements |
| `/unwarn id` | Supprimer un avertissement |
| `/clear N [@user]` | Supprimer N messages (filtre membre optionnel) |

#### 🛡️ Anti-spam (automatique)
| Protection | Déclencheur | Action |
|------------|-------------|--------|
| **Flood** | 12 messages en 6s | Mute 5 min + suppression + log |
| **Mention spam** | 10+ mentions / message | Mute 10 min + suppression + log |
| **Liens phishing** | Domaines typosquats (steam-com, discord-nitro…) | Mute 5 min + suppression + log |

Modérateurs (permission `Gérer les messages`) immunisés.

#### 🎭 Auto-rôle & règlement
- Validation Discord Community → rôle **Citoyen(e) LYG** auto
- `/reglement-post` pour (re)poster le message règlement avec bouton acceptation

#### 🔗 Liaison compte
- `/link` — Lier son compte Discord à son personnage RP (avec rename auto du pseudo Discord selon les conventions famille)
- `/linkpanel` — Poster le panneau de liaison dans le salon bots-famille
- `/unlink` — Délier son compte

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

## 🔐 RBAC — 4 tiers de permissions

| Rôle | Voit la sidebar | Actions sensibles | Up/Down WL | Cookie LYG admin |
|------|---|---|---|---|
| **Chef famille** | Tout | ✅ | ✅ | ✅ |
| **Sous-Chef famille** | Tout | ✅ | ✅ | ✅ |
| **État-Major** | Tout | ✅ | ❌ (Add/Remove seulement) | ❌ |
| **Encadrant** | Tout sauf Famille WL et Cookie LYG | ❌ (lecture seule) | ❌ | ❌ |
| **Recruteur** | Dashboard + Recrutement uniquement | — | — | — |

**Guards serveur** :
- `requirePrivileged()` — tout staff (n'importe quel rôle)
- `requireStaffFull()` — Chef + Sous-Chef + EM + Encadrant (lecture pages)
- `requireFullWriter()` — Chef + Sous-Chef + EM (actions sensibles, exclut Encadrant) → sanctions, plaintes, finalize réunion, grades
- `requireChefFamille()` — Chef + Sous-Chef seulement (cookie LYG admin, gestion WL rangs)
- `requireChef()` — Chef famille seul

Tentatives d'accès refusées → audit log dédié (`WRITER_DENIED`, `CHEF_FAMILLE_DENIED`).

---

## 🎬 Automatisations clés

### Recrutement APPROVED
1. Décision validée dans le panel ou Discord (`/decide`)
2. Attribution auto des rôles Discord (Novato, Los Esperados, Homme de rang…)
3. **Auto-add WL famille** via cookie LYG → membre apparaît dans `families.lyg.fr` immédiatement
4. Embed Discord adapté au résultat :
   - ✅ **Auto-WL OK** (vert) — pas d'action manuelle requise
   - ⚠️ **Demande de WL** (ambre) — fallback si cookie expiré, avec raison de l'échec

### Sanction DEMOTE / BLACKLIST
1. Sanction créée dans le panel
2. Worker outbox traite la sanction
3. Rôles Discord adaptés (DEMOTE, BLACKLIST roles)
4. **Auto-remove WL famille** via appel interne au panel proxy LYG
5. Audit log + mise à jour de `wlClass` localement (sans attendre la prochaine sync)

### Absence APPROVED / REJECTED
- Embed Discord posté dans #absences mentionnant le membre
- Couleur verte (validée) ou rouge (refusée) avec raison du refus
- Le membre reçoit une notif Discord native

### Famille WL — mode live
- Page `/staff/family` affiche les 41+ membres avec leur rang LYG synchronisé
- Boutons **Up / Down / Owner / Remove / Add** → modifs poussées en temps réel sur `families.lyg.fr` via le cookie chiffré
- **Keep-alive** : ping du dashboard families.lyg.fr toutes les 10 min → la session PHP reste vivante indéfiniment
- Détection auto d'expiration cookie → badge rouge + invitation à refournir

### In-family loop
- Poll de `/api/darkrp/familles/playtimes` (LYG) toutes les **30s** avec fenêtre 4 min
- Membres avec playtime famille > 0 dans la fenêtre → considérés "en jeu"
- Cache 5 min de grâce après dernière activité → évite les yo-yo
- Pause auto en cas de 429 LYG (backoff 60 s)

### Warns in-game (LYG)
- Poller bot Discord toutes les ~10 min sur `/api/warns/:steamId`
- Nouveaux warns POST-recrutement → embed Discord + DB
- Déduplication par contrainte unique `(steamId, warnDate, type)`
- Filtre `gradeLevel > 0` (exclut démotés, blacklistés)

### Sync hiérarchie Discord
- Refresh auto toutes les minutes du message épinglé "Hiérarchie famille"
- Multi-section : Chef famille, Sous-Chef famille, **Chef État-Major** (Consejero), État-Major, etc.
- Calcul depuis `Member.discordRoleIds` (source de vérité, pas le cache grade DB)

---

## 🛠️ Stack technique

- **Framework** : Next.js 16 (App Router) + React 19 + TypeScript
- **Base de données** : PostgreSQL 17 + Prisma 5 ORM
- **Authentification** : NextAuth.js v5 (OAuth Discord)
- **UI** : Tailwind CSS 4 + Radix UI + Lucide Icons + Framer Motion
- **Discord** : Discord.js 14 (worker séparé en process Node.js)
- **Chiffrement secrets** : AES-256-GCM (cookie LYG admin)
- **Observability** : Sentry (panel + worker) + audit DB
- **Infra** : VPS Ubuntu + Cloudflare Tunnel + systemd

---

## 🏗️ Architecture

```
panel/
├── app/
│   ├── (member)/                      # Espace membre — dashboard, banque, justificatifs
│   │   ├── dashboard/                 # Solde + transactions
│   │   ├── justificatifs/
│   │   │   ├── absence/               # Form Réunion / Générale
│   │   │   └── sanction/              # Form Warn / Jail / Ban
│   │   └── components/                # MemberLayoutShell + sidebar
│   ├── staff/
│   │   ├── dashboard/                 # KPI staff
│   │   ├── members/                   # Liste + fiche détaillée
│   │   ├── family/                    # 🆕 Gestion WL famille (live ou planif)
│   │   ├── warns/                     # Sanctions IG LYG
│   │   ├── absences/                  # Workflow validation
│   │   ├── sanctions/                 # Création + suivi
│   │   ├── meetings/                  # Réunions hebdo
│   │   ├── complaints/                # Plaintes
│   │   ├── banklogs/                  # Logs banque
│   │   ├── stats/                     # Stats + dettes
│   │   ├── recruitments/              # Tickets
│   │   ├── settings/
│   │   │   └── lyg-cookie/            # 🆕 Cookie LYG admin chiffré (Chef seulement)
│   │   ├── error.tsx / not-found.tsx  # 🆕 Pages d'erreur stylées
│   │   └── layout.tsx                 # Détection rôle → accessLevel
│   ├── guide/                         # 🆕 Guides publics (build, négo, conduite)
│   ├── jlg/                           # 🆕 Page événement Technique J.L.G
│   ├── error.tsx / global-error.tsx   # 🆕 Catch-all stylé root
│   ├── not-found.tsx                  # 🆕 404 stylé
│   └── api/
│       ├── staff/
│       │   ├── family/
│       │   │   ├── members/           # 🆕 GET liste + PATCH intent
│       │   │   └── lyg/               # 🆕 POST actions live (up/down/add/remove)
│       │   ├── settings/
│       │   │   └── lyg-cookie/        # 🆕 GET/POST/DELETE cookie chiffré
│       │   ├── sanctions/             # CRUD + apply + clear + retry
│       │   ├── meetings/              # Decisions + finalize + row
│       │   └── ...
│       └── internal/
│           └── lyg/
│               └── family-remove/     # 🆕 Endpoint interne worker → proxy LYG
├── src/
│   ├── components/
│   │   ├── error-screen.tsx           # 🆕 Composant unifié pages erreur
│   │   └── staff/ui/
│   │       ├── ConfirmDialog.tsx      # 🆕 Modal stylée
│   │       └── use-confirm.tsx        # 🆕 Hook impératif useConfirm()
│   ├── lib/
│   │   ├── crypto-secret.ts           # 🆕 AES-256-GCM encrypt/decrypt
│   │   ├── lyg/
│   │   │   ├── family-admin.ts        # 🆕 Proxy families.lyg.fr (cookie)
│   │   │   ├── family-keepalive.ts    # 🆕 Keep-alive cookie 10 min
│   │   │   ├── client.ts              # API publique LYG (X-API-Token)
│   │   │   ├── sync-members.ts        # Sync DB ↔ LYG members
│   │   │   ├── sync-banklogs.ts
│   │   │   └── ...
│   │   ├── in-family-loop.ts          # Loop "qui est en jeu" 30s
│   │   ├── rbac.ts                    # canAccessStaffPanel + isCurrentSessionChefFamille
│   │   ├── guards.ts                  # requireFullWriter, requireChefFamille
│   │   └── ...
│   └── server/                        # Auth + rate-limit
├── discord-worker/
│   └── src/
│       ├── features/
│       │   ├── logs/                  # Logs serveur enrichis (audit log fetch pour ban/kick)
│       │   ├── moderation/            # Commandes ban/kick/mute/warn/clear
│       │   ├── reglement/             # Bouton acceptation
│       │   └── lygWarnPoller.ts       # Poller warns LYG
│       ├── lib/
│       │   └── admin-command-log.ts   # 🆕 Helper audit commandes staff
│       └── outbox-processor.ts        # Traite jobs Discord + appel auto-remove WL
└── prisma/                            # Schéma + migrations (54 modèles)
```

Deux services en production :
- **panel-esperados.service** — site web Next.js (port 3000)
- **discord-worker.service** — bot Discord + pollers LYG

---

## 🔄 Boucles de fond

| Loop | Fréquence | Fenêtre | Rôle |
|---|---|---|---|
| **in-family** | 30 s | 4 min | Détecter qui est en métier famille (panel) |
| **lyg-keepalive** | 10 min | — | Maintenir le cookie families.lyg.fr en vie |
| **members sync** | 3 min | — | Sync DB ↔ LYG members + WL classes |
| **banklogs sync** | 3 min | — | Sync logs bancaires |
| **playtime sync** | 10 min | — | Sync 7d playtime |
| **hierarchy refresh** | 1 min | — | Refresh embed hiérarchie Discord |
| **lygWarnPoller** | ~10 min | — | Détecter nouveaux warns IG (worker) |

Total : ~57 calls / 15 min vers LYG — bien sous le budget de 100 req/15min.

---

## 🚀 Installation

### Prérequis
- Node.js 20+
- PostgreSQL 16+
- Un bot Discord configuré

### 1. Cloner et installer
```bash
git clone https://github.com/syko-003-maker/panel-esperados-.git
cd panel-esperados-
npm install
cd discord-worker && npm install && cd ..
```

### 2. Configuration `.env.prod`
```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/panel_db"
SHADOW_DATABASE_URL="postgresql://..."

# NextAuth
NEXTAUTH_URL="https://votre-domaine.fr"
NEXTAUTH_SECRET="..."

# Discord OAuth + bot
DISCORD_CLIENT_ID="..."
DISCORD_CLIENT_SECRET="..."
DISCORD_BOT_TOKEN="..."
DISCORD_GUILD_ID="..."

# Inter-service auth
INGEST_SECRET="..."
INGEST_BASE_URL="http://127.0.0.1:3000"
WORKER_INTERNAL_URL="http://127.0.0.1:3001"

# LYG API
LYG_BASE_URL="https://api.lyg.fr"
LYG_TOKEN="..."                       # Token d'auth (header X-API-Token)
LYG_FAMILY_TOKEN="LYG_token_..."      # Token identité famille (dans le body)

# Cookie LYG admin (chiffrement)
# Générer : node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
LYG_COOKIE_ENCRYPTION_KEY="..."

# Rôles Discord (auto-détectés si nom standard)
CHEF_FAMILLE_ROLE_ID="..."
SOUS_CHEF_FAMILLE_ROLE_ID="..."
ETAT_MAJOR_ROLE_ID="..."
ENCADRANT_ROLE_ID="..."
RECRUTEUR_ROLE_ID="..."

# Channels Discord
DISCORD_LOGS_CHANNEL_ID="..."
```

### 3. Base de données
```bash
npx prisma migrate deploy
npx prisma generate
```

### 4. Lancement
```bash
# Build
npm run build
cd discord-worker && npm run build && cd ..

# Production (via systemd)
sudo systemctl start panel-esperados.service
sudo systemctl start discord-worker.service

# Dev
npm run dev
cd discord-worker && npm run dev
```

---

## 🔧 Discord Developer Portal

1. Créer une application + bot
2. **Privileged Gateway Intents** activés :
   - ✅ Server Members Intent
   - ✅ Message Content Intent
   - ✅ Presence Intent
3. **Redirect URI OAuth** : `https://votre-domaine.fr/api/auth/callback/discord`
4. **Permissions bot** : `Administrator` recommandé (ou granulaire : Ban, Kick, Moderate, Manage Messages, Manage Roles, **View Audit Log**, Send Messages)

---

## 🏭 Déploiement production

```bash
# Build panel
npm run build
sudo systemctl restart panel-esperados.service

# Build + restart discord worker
cd discord-worker && npm run build
sudo systemctl restart discord-worker.service
```

Site exposé via **Cloudflare Tunnel** — aucun port ouvert directement sur internet.

---

## 🔐 Sécurité

- **Auth OAuth Discord** obligatoire
- **RBAC 4 tiers** + guards par route (cf. section RBAC)
- **Cookie LYG admin** chiffré AES-256-GCM, jamais loggé, masqué dans l'UI (`bcd6…02ef6`)
- **Audit log complet** sur toutes les actions sensibles (incl. tentatives refusées)
- **Single-user mode** sur le proxy LYG : seul le propriétaire du cookie peut déclencher des actions
- **Ports DB** bloqués par UFW (127.0.0.1 only)
- **Secrets** : `.env*` git-ignorés
- **CSP / IP cachée** derrière Cloudflare

---

## 📡 Intégration Discord — Outbox pattern

```
Panel  ──crée job──► DiscordOutbox (DB) ──poll 3s──► Worker ──API Discord
```

Chaque message / rôle / action passe par une queue avec retry automatique en cas d'échec. Avantages :
- **Résilience** : si Discord est down, les jobs attendent et seront rejoués
- **Déduplication** via `dedupeKey`
- **Idempotence** : les sanctions sont marquées `discordAppliedAt` une seule fois

---

## 🐛 Problèmes fréquents

| Problème | Solution |
|----------|---------|
| `ECONNREFUSED 3001` | Le Discord Worker n'est pas lancé |
| `INGEST_SECRET missing` | Vérifier le .env du panel et du worker (identiques) |
| Session expirée après migration DB | Déconnecter / reconnecter |
| Rôles Discord non synchronisés | `/syncroles` dans Discord |
| Logs Discord vides | Vérifier Message Content Intent + permission View Audit Log |
| Warns IG non reçus | Vérifier `LYG_TOKEN` + `DISCORD_LOGS_CHANNEL_ID` |
| `401 LYG playtime authentication failed` | Le token LYG a été révoqué — demander un nouveau à l'admin LYG |
| Cookie LYG marqué expiré | Re-login sur families.lyg.fr puis recoller le cookie via `/staff/settings/lyg-cookie` |
| Mode live LYG inactif | Vérifier que le cookie est configuré ET propriétaire = utilisateur courant |
| `LYG_COOKIE_ENCRYPTION_KEY missing` | Générer avec `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| Membres fantômes dans WL | Backfill : `UPDATE "Member" SET "wlClassIntent" = "wlClass" WHERE "wlClassIntent" IS NULL AND "wlClass" IS NOT NULL;` |

---

## 📝 Notes de développement

- **Dates client → serveur** : toujours en ISO 8601 (`toISOString()`)
- **Prisma → client** : sérialiser Date → string
- **OAuth en local** : toujours `http://localhost:3000` (pas l'IP LAN)
- **Famille slug vs CUID** : `resolveFamilyId("esperados")` retourne le CUID DB
- **LYG auth** : header `X-API-Token` (Bearer obsolète depuis printemps 2026)
- **Token famille vs API** : LYG_FAMILY_TOKEN dans le body, LYG_TOKEN dans le header
- **Cookie LYG admin** : seul le Chef famille / Sous-Chef peuvent le configurer
- **Bot pré-charge 100 msg/salon** au démarrage pour les logs de suppression
- **Auto-attendance lock** : si un staff édite manuellement une présence en réunion (`attendanceLockedByStaff=true`), l'auto-attendance ne l'écrasera pas au prochain GET

---

## 👤 Auteur

Projet développé pour la communauté **Los Esperados** — Garry's Mod RP FR (serveur LiveYourGame).

> Panel construit et maintenu par Syko.
