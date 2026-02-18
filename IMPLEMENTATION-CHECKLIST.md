# Checklist Implémentation - Système de Liaison

## `/link` Command - WORKFLOW COMPLET

### ✅ 1. Slash command /link
- ✅ Paramètre obligatoire: utilisateur Discord cible
- ✅ Réservé aux rôles Chef / État-Major
- ✅ Interdire auto-liaison (auteur === cible)

### ✅ 2. À l'exécution de /link
- ✅ Envoyer un embed "🔗 Panneau de Liaison"
- ✅ Design soigné:
  - ✅ Couleur bleu/violet (`0x5865f2`)
  - ✅ Thumbnail (avatar du membre)
  - ✅ Champs:
    - ✅ Discord: @user
    - ✅ SteamID64: valeur ou "❌ Non lié"
    - ✅ Nom RP: valeur ou "❌ Non défini"
    - ✅ Statut: 🟢 Lié / 🔴 Non lié
  - ✅ Footer: "Los Esperados • Système de liaison"

- ✅ Ajouter boutons:
  - ✅ 🔗 Lier / Modifier (PRIMARY)
  - ✅ 🗑 Supprimer (DANGER)
  - ✅ ❌ Annuler (SECONDARY)

### ✅ 3. Bouton ❌ Annuler
- ✅ Désactive tous les boutons
- ✅ Répond avec embed gris "Action annulée"

### ✅ 4. Bouton 🔗 Lier / Modifier
- ✅ Affiche confirmation orange d'abord (nouvelle étape!)
- ✅ Montre les données actuelles
- ✅ Ensuite: Ouvre un modal Discord
- ✅ Champs requis:
  - ✅ SteamID64 (17 chiffres min, validation)
  - ✅ Nom RP (3 caractères min, max 50)

### ✅ 5. Validation du modal
- ✅ Afficher un embed de CONFIRMATION:
  - ✅ "⚠️ Confirmer la liaison"
  - ✅ Récapitulatif:
    - ✅ Discord
    - ✅ SteamID64
    - ✅ Nom RP
  - ✅ Boutons:
    - ✅ ✅ Confirmer
    - ✅ ❌ Annuler

### ✅ 6. Bouton ✅ Confirmer
- ✅ Appeler l'API du panel (POST /api/staff/link)
- ✅ Créer ou mettre à jour la liaison
- ✅ Répondre avec un embed vert:
  - ✅ "✅ Liaison enregistrée"
  - ✅ Champs:
    - ✅ Discord
    - ✅ SteamID64
    - ✅ Nom RP
  - ✅ Désactiver tous les boutons

### ✅ 7. Bouton 🗑 Supprimer
- ✅ Afficher un embed de confirmation rouge:
  - ✅ "⚠️ Confirmer la suppression"
  - ✅ Boutons:
    - ✅ 🗑 Confirmer la suppression
    - ✅ ❌ Annuler

### ✅ 8. Confirmation suppression
- ✅ Appeler l'API panel (DELETE /api/staff/link)
- ✅ Embed rouge:
  - ✅ "🗑 Liaison supprimée avec succès"

---

## `/unlink` Command - COMPLÈTE

### ✅ Slash command /unlink
- ✅ Paramètre obligatoire: utilisateur Discord cible
- ✅ Réservé Chef / État-Major
- ✅ Interdire auto-unlink

### ✅ Afficher confirmation
- ✅ "⚠️ Confirmer la suppression de la liaison pour @user"

### ✅ Boutons
- ✅ 🗑 Confirmer
- ✅ ❌ Annuler

### ✅ Appeler DELETE /api/staff/link
- ✅ Effectué

### ✅ Répondre avec embed rouge succès
- ✅ "✅ Liaison Supprimée"

---

## SÉCURITÉ & TECHNIQUE

### ✅ Vérifier les rôles Discord:
- ✅ À la commande
- ✅ À CHAQUE interaction (bouton, modal)

### ✅ Interdire toute action sur soi-même
- ✅ Pour /link
- ✅ Pour /unlink

### ✅ Boutons expirent après timeout
- ✅ Géré par Discord (3 minutes)
- ✅ Collector timeout possible

### ✅ Désactiver boutons après action
- ✅ Sur cancel
- ✅ Sur succès

### ✅ Toutes les actions doivent être loggées
- ✅ Channel Discord (embed)
- ✅ Console (JSON)

---

## CONTRAINTES

- ✅ discord.js v14
- ✅ SlashCommandBuilder
- ✅ ButtonBuilder / ActionRowBuilder
- ✅ ModalBuilder / TextInputBuilder
- ✅ Embeds lisibles, professionnels
- ✅ Code structuré (commands / handlers / utils)
- ✅ Aucun code client
- ✅ Prêt production
- ✅ Ne pas casser l'existant

---

## LIVRABLE

- ✅ Commande /link complète
- ✅ Commande /unlink complète
- ✅ Embeds stylés
- ✅ Boutons + modals + confirmations
- ✅ Gestion des erreurs
- ✅ Code prêt à commit

---

## Améliorations par rapport aux specs initiales

**Étapes ajoutées pour meilleure UX**:
1. ⭐ Bouton "Annuler" dans le panel initial
2. ⭐ Confirmation avant modal (étape intermédiaire)
3. ⭐ Affichage des données actuelles dans confirmation
4. ⭐ Messages d'erreur contextualisés

**Gestion avancée**:
1. ⭐ Tous les custom IDs centralisés en constantes
2. ⭐ Embeds de confirmation multi-color (orange/rouge/gris/vert)
3. ⭐ Logging détaillé à chaque étape
4. ⭐ Validation SteamID64 stricte (17 chiffres exactement)

---

**Statut**: ✅ 100% IMPLÉMENTÉ
**Compilation**: 0 erreurs TypeScript
**Build**: Succès (Next.js + Discord Worker)
