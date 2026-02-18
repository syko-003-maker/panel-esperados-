# Plan de Test - Système de Liaison

## 🧪 Tests Manuels Recommandés

> ⚠️ À effectuer dans un serveur Discord de test avant production

---

## 1️⃣ Test: `/link` - Liaison Nouvelle

### Prérequis
- [ ] Bot a permission ManageMessages
- [ ] Utilisateur a rôle Chef/État-Major
- [ ] Utilisateur test n'a pas de liaison existante
- [ ] Panel API en ligne (`INGEST_BASE_URL`)
- [ ] Audit channel configuré (`TICKETS_LOGS_CHANNEL_ID`)

### Étapes
```
1. /link @TestUser
   ✅ Bot affiche panel avec 3 boutons
   ✅ Embed bleu (#5865f2)
   ✅ SteamID64 affiche "❌ Non lié"
   ✅ Nom RP affiche "❌ Non défini"
   ✅ Statut affiche 🔴 Non lié

2. Clic [🔗 Lier/Modifier]
   ✅ Embed orange de confirmation (éphémère)
   ✅ Affiche "Cet utilisateur n'est pas encore lié"
   ✅ 2 boutons: [✅ Continuer] [❌ Annuler]

3. Clic [✅ Continuer]
   ✅ Modal s'affiche
   ✅ Titre: "Lier un Membre"
   ✅ Champs vides (premère liaison)
   ✅ SteamID64 placeholder "76561198012345678"
   ✅ Nom RP placeholder "Jean Dupont"

4. Remplit form:
   SteamID64: 76561198012345678
   Nom RP: Jean Dupont
   Clic [Envoyer]

5. Embed de confirmation (orange)
   ✅ Titre: "⚠️ Confirmer la liaison"
   ✅ Affiche les données
   ✅ 2 boutons: [✅ Confirmer] [❌ Annuler]

6. Clic [✅ Confirmer]
   ✅ Embed vert de succès (éphémère)
   ✅ Message: "✅ Liaison Enregistrée"
   ✅ Affiche les données enregistrées

7. Vérifications:
   ✅ Console logs (JSON) avec "link_submit_ok"
   ✅ Discord audit channel embed avec "🔗 **Liaison Créée**"
   ✅ Affiche: "@Chef a lié @TestUser (Steam: `765...`, RP: **Jean Dupont**)"
   ✅ Buttons du panel initial sont désactivés
```

---

## 2️⃣ Test: `/link` - Modification (Liaison Existante)

### Prérequis
- [ ] TestUser a déjà une liaison (voir Test 1)
- [ ] Données: SteamID `76561198012345678`, RP `Jean Dupont`

### Étapes
```
1. /link @TestUser
   ✅ Bot affiche panel avec données
   ✅ SteamID64 affiche "76561198012345678"
   ✅ Nom RP affiche "Jean Dupont"
   ✅ Statut affiche 🟢 Lié

2. Clic [🔗 Lier/Modifier]
   ✅ Embed orange de confirmation
   ✅ Affiche "**Données actuelles:**"
   ✅ Affiche: "• SteamID: `76561198012345678`"
   ✅ Affiche: "• Nom RP: **Jean Dupont**"

3. Clic [✅ Continuer]
   ✅ Modal s'affiche
   ✅ SteamID64 **pré-rempli**: "76561198012345678"
   ✅ Nom RP **pré-rempli**: "Jean Dupont"

4. Modifie:
   SteamID64: 76561198012345999  (changé)
   Nom RP: Jean Martin           (changé)
   Clic [Envoyer]

5. Confirmation + Succès
   ✅ Affiche nouvelles données
   ✅ Embed vert avec données mises à jour

6. Vérifications:
   ✅ Console logs avec "link_submit_ok"
   ✅ Discord audit "🔗 **Liaison Créée**" (modification)
   ✅ Données mises à jour dans le panel
```

---

## 3️⃣ Test: `/link` → Supprimer via Bouton

### Prérequis
- [ ] TestUser a une liaison existante
- [ ] Audit channel en ligne

### Étapes
```
1. /link @TestUser
   ✅ Affiche panel avec données

2. Clic [🗑️ Supprimer]
   ✅ Embed rouge de confirmation (éphémère)
   ✅ Titre: "⚠️ Confirmer la suppression"
   ✅ Message: "Êtes-vous sûr de vouloir..."
   ✅ 2 boutons: [🗑️ Confirmer] [❌ Annuler]

3. Clic [🗑️ Confirmer la suppression]
   ✅ Embed rouge de succès (éphémère)
   ✅ Titre: "🗑️ Liaison Supprimée"
   ✅ Message: "La liaison de @TestUser a été supprimée"
   ✅ Boutons panel initial désactivés

4. Vérifications:
   ✅ Console logs: "link_delete_ok"
   ✅ Discord audit: "🗑️ **Liaison Supprimée** - @Chef a supprimé..."
   ✅ TestUser n'a plus de liaison dans le panel
```

---

## 4️⃣ Test: `/unlink` - Suppression Directe

### Prérequis
- [ ] TestUser a une liaison existante
- [ ] Chef/État-Major seulement

### Étapes
```
1. /unlink @TestUser
   ✅ Embed rouge de confirmation (éphémère)
   ✅ Titre: "⚠️ Confirmer la suppression de la liaison"
   ✅ Message: "Êtes-vous sûr de vouloir supprimer la liaison pour @TestUser?"
   ✅ 2 boutons: [🗑️ Confirmer] [❌ Annuler]

2. Clic [🗑️ Confirmer la suppression]
   ✅ Embed vert de succès (éphémère)
   ✅ Titre: "✅ Liaison Supprimée"
   ✅ Message: "La liaison de @TestUser a été supprimée avec succès"

3. Vérifications:
   ✅ Console logs: "unlink_delete_ok"
   ✅ Discord audit: "🗑️ **Liaison Supprimée**" (via /unlink)
   ✅ Liaison supprimée
```

---

## 5️⃣ Test: Annulation - Tous les Points

### Étapes
```
A. /link @TestUser → Clic [❌ Annuler] (panel initial)
   ✅ Embed gris: "❌ Action Annulée"
   ✅ Boutons panel désactivés

B. /link @TestUser → [🔗] → Clic [❌ Annuler] (confirmation)
   ✅ Embed gris: "❌ Action Annulée"
   ✅ Pas de modal

C. /link @TestUser → [🔗] → Modal → Échoué
   Clic [❌ Annuler] (confirmation final)
   ✅ Pas d'API call
   ✅ Données non changées

D. /unlink @TestUser → Clic [❌ Annuler]
   ✅ Embed gris: "❌ Action Annulée"
   ✅ Liaison non supprimée
```

---

## 6️⃣ Tests d'Erreurs - Validation

### 6.1 SteamID64 Invalide
```
1. /link @TestUser → [🔗] → [✅ Continuer]
2. Modal:
   SteamID64: "abc123"          ← INVALIDE
   Nom RP: "Test"
3. Clic [Envoyer]

✅ Embed rouge d'erreur (éphémère)
✅ Message: "Le SteamID64 doit être un nombre à 17 chiffres"
✅ Console logs: "link_submit_validation_error"
✅ Pas d'API call
✅ Utilisateur peut réessayer
```

### 6.2 SteamID64 Trop Court
```
SteamID64: "1234567890"         ← Seulement 10 chiffres

✅ Même comportement que 6.1
```

### 6.3 Nom RP Trop Long
```
Nom RP: "A" × 51 caractères     ← Dépasse max 50

✅ Embed rouge: "Le nom RP doit être entre 1 et 50 caractères"
```

### 6.4 Nom RP Vide
```
Nom RP: "" (vide)

✅ Embed rouge: "Le nom RP doit être entre 1 et 50 caractères"
```

---

## 7️⃣ Tests de Sécurité

### 7.1 Auto-Liaison Interdite
```
1. /link @ChefUser  (l'utilisateur teste sur lui-même)

✅ Embed rouge (éphémère)
✅ Message: "Vous ne pouvez pas vous lier vous-même"
✅ Console logs: "Self link attempt"
✅ Pas de panel, pas de boutons
```

### 7.2 Auto-Unlink Interdite
```
1. /unlink @ChefUser  (l'utilisateur test sur lui-même)

✅ Embed rouge (éphémère)
✅ Message: "Vous ne pouvez pas retirer votre propre liaison"
```

### 7.3 Accès Refusé (Pas Chef/État-Major)
```
1. Utilisateur normal (pas Chef): /link @User

✅ Embed rouge (éphémère)
✅ Message: "Seuls les Chef Famille ou État-Major peuvent utiliser cette commande"
✅ Pas de panel
✅ Console logs: "Not chef role"
```

### 7.4 Accès Refusé sur Interaction
```
1. Chef lance: /link @User
2. Envoie le panel
3. Non-Chef clique sur [🔗]

✅ Embed rouge (éphémère)
✅ Message: "Vous n'avez pas les permissions pour cette action"
✅ Panel reste intact (pour le chef)
```

---

## 8️⃣ Tests d'API

### 8.1 GET /api/staff/link/{discordId}
```
Lors du: /link @TestUser (fetch données)

✅ API répond avec data ou null
✅ Si null → "❌ Non lié"
✅ Si data → affiche SteamID + Nom RP
```

### 8.2 POST /api/staff/link
```
Lors du: Confirmation finale après modal

✅ API crée/update
✅ Response: {ok: true, steamId, rpName, memberId}
✅ Si ok: Embed vert succès
✅ Si erreur: Embed rouge "Erreur API"
```

### 8.3 DELETE /api/staff/link/{discordId}
```
Lors du: Confirmation suppression

✅ API supprime
✅ Si ok: Embed vert/rouge succès
✅ Si erreur: Embed rouge "Impossible de supprimer"
```

### 8.4 API Timeout
```
Simule: Panel API lente ou offline

✅ Après 10s timeout
✅ Embed rouge: "Une erreur s'est produite: [error]"
✅ Console logs: erreur avec contexte
```

---

## 9️⃣ Tests de Logging

### 9.1 Console Logs (JSON)
```
Ouvrir: Discord bot console

Vérifier logs contiennent:
✅ "link_command_start" - /link lancé
✅ "link_command_ok" - Panel affiché
✅ "link_button_click" - Bouton cliqué
✅ "link_confirmation_shown" - Confirmation affichée
✅ "link_modal_shown" - Modal affiché
✅ "link_submit_ok" - Liaison enregistrée
✅ "link_delete_ok" - Liaison supprimée
✅ "unlink_delete_ok" - /unlink suppression

Chaque log contient:
✅ "timestamp": "2026-01-31T..."
✅ "userId": "123456..."
✅ "targetId": "654321..." (le cas échéant)
✅ Contexte complet
```

### 9.2 Discord Audit Channel
```
Vérifier: TICKETS_LOGS_CHANNEL_ID

Pour liaison:
✅ Embed bleu (#5865f2)
✅ Titre: "🔗 Liaison"
✅ Description: "🔗 **Liaison Créée** - @Chef a lié @TestUser (Steam: `765...`, RP: **Jean Dupont**)"
✅ Timestamp

Pour suppression:
✅ Titre: "🔗 Liaison"
✅ Description: "🗑️ **Liaison Supprimée** - @Chef a supprimé la liaison de @TestUser"
```

---

## 🔟 Tests de Performance

### Temps de Réponse
```
Action → Réaction Bot (ms)

✅ /link @User → Panel: < 500ms
✅ Bouton → Confirmation: < 300ms
✅ Modal submission → Confirmation final: < 500ms
✅ API call → Succès: < 1000ms (dépend panel)
```

### Pas de Memory Leaks
```
Après 100 interactions:
✅ Bot memory stable
✅ Pas d'accumulation de listeners
✅ Collectors timeout proprement
```

---

## Checklist Finale

### Fonctionnalité
- [ ] /link crée panel
- [ ] /link modification pré-remplit
- [ ] /unlink direct
- [ ] Boutons répondent
- [ ] Modal apparaît
- [ ] API calls marchent
- [ ] Confirmations affichées
- [ ] Annulation fonctionne

### Sécurité
- [ ] Rôle vérifié (commande)
- [ ] Rôle vérifié (interaction)
- [ ] Self-link interdit
- [ ] Self-unlink interdit
- [ ] Validation SteamID (17 chiffres)
- [ ] Validation Nom RP (1-50)

### UX
- [ ] Embeds professionnels
- [ ] Couleurs appropriées
- [ ] Messages clairs
- [ ] Erreurs explicites
- [ ] Confirmations explicites

### Logging
- [ ] Console JSON (15+ événements)
- [ ] Discord audit channel
- [ ] Timestamps précis
- [ ] Contexte complet

### Code Quality
- [ ] TypeScript 0 erreurs
- [ ] Build réussi
- [ ] Pas de console errors
- [ ] Handlers testés

---

## 🚨 Erreurs Attendues (À Ignorer)

```
[ingest/tickets] INGEST_SECRET not configured
```
→ Normal, c'est une requête depuis le panel. Ignorer.

---

**Résultat Attendu**: ✅ Tous les tests passent

**Prochaine Étape**: Déploiement en production
