# 📸 Guide de capture — pour le README portfolio

Le README affiche une grille de captures. **Dépose simplement les fichiers PNG dans ce dossier avec les noms exacts ci-dessous** — aucune modification du Markdown n'est nécessaire, les images apparaîtront automatiquement.

---

## ✅ Les 6 captures du README (obligatoires)

| Fichier (nom exact) | Écran à capturer | Pourquoi ça impressionne |
|---|---|---|
| `01-staff-dashboard.png` | **Dashboard staff** (`/staff/dashboard`) | Vue d'ensemble pro, KPI temps réel |
| `02-members.png` | **Liste des membres** (`/staff/members`) avec les filtres visibles | Filtres, compteurs, statut « en jeu » live |
| `03-family-wl.png` | **Whitelist famille** (`/staff/family`) | Pilotage temps réel d'un site tiers |
| `04-wl-weapons.png` | **Armes par classe** (`/staff/family/weapons`) | Budget de points + binds générés |
| `05-printer-calculator.png` | **Calculateur** (`/staff/printers` ou `/printers`) avec 3-4 modèles sélectionnés | Logique métier + comparateur |
| `06-discord-bot.png` | **Discord** : un log enrichi OU le message de hiérarchie OU un embed de warn | Prouve le bot autonome |

> Pour `06`, capture directement **dans le client Discord** (salon de logs, message de hiérarchie épinglé, ou un embed de warn).

---

## ➕ Captures bonus (facultatives — pour étoffer le portfolio)

Tu peux en ajouter d'autres (elles ne sont pas référencées par défaut, mais utiles à montrer en entretien) :

- `07-member-dashboard.png` — Espace membre, solde bancaire avec visuel coloré
- `08-sanction-detail.png` — Fiche de sanction (le design refait)
- `09-meeting.png` — Gestion d'une réunion (présences + décisions)
- `10-login.png` — Page de connexion (OAuth Discord)
- `11-justification-embed.png` — L'embed Discord de justification de sanction
- `12-settings-lyg.png` — Paramètres cookie LYG (valeur déjà masquée)

---

## 🎨 Conseils de prise de vue

- **Résolution** : ~1440 px de large minimum (ou plein écran Full HD). Net et lisible.
- **Thème** : le panel est en thème sombre — capture tel quel, c'est élégant.
- **Format** : PNG. Vise < 500 Ko par image (compresse au besoin, ex. [tinypng.com](https://tinypng.com)).
- **Cadrage** : tu peux garder ou rogner la barre du navigateur, mais sois cohérent sur toutes les captures.

## 🔒 Avant de publier — anonymise les données sensibles

Ce panel manipule des données réelles. Avant de mettre les captures dans un repo public ou un portfolio :

- **Floute ou remplace** : pseudos RP réels, IDs Discord, IDs Steam, montants bancaires, avatars de vrais membres.
- **Vérifie** qu'aucun **token, cookie ou secret** n'apparaît (le cookie LYG est déjà masqué dans l'UI, mais contrôle).
- L'idéal : capturer sur un **jeu de données de test** plutôt que la prod.

> 💡 Astuce entretien : une ou deux captures **annotées** (flèches + légendes sur les points techniques : « file de jobs », « budget validé côté serveur ») valent mieux que dix captures brutes.
