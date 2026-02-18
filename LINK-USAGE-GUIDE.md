# Guide d'Utilisation - Système de Liaison

## Pour les Chefs/État-Major

---

## `/link` - Liaison Interactive

### Cas 1: Lier un nouveau membre

```
/link @Jean
```

**Réponse du bot:**
```
┌────────────────────────────────┐
│ 🔗 Panneau de Liaison          │
├────────────────────────────────┤
│ Discord: @Jean                 │
│ SteamID64: ❌ Non lié          │
│ Nom RP: ❌ Non défini          │
│ Statut: 🔴 Non lié            │
│                                │
│ Los Esperados • Système        │
└────────────────────────────────┘

[🔗 Lier/Modifier] [🗑️ Supprimer] [❌ Annuler]
```

#### Chef clique sur "🔗 Lier/Modifier"

**Bot répond (éphémère):**
```
┌────────────────────────────────┐
│ ⚠️ Confirmer la liaison        │
├────────────────────────────────┤
│ Vous êtes sur le point de      │
│ lier @Jean.                    │
│                                │
│ Cet utilisateur n'est pas      │
│ encore lié.                    │
└────────────────────────────────┘

[✅ Continuer vers le formulaire] [❌ Annuler]
```

#### Chef clique sur "✅ Continuer"

**Bot affiche modal:**
```
┌──────────────────────────────┐
│ Lier un Membre               │
├──────────────────────────────┤
│ SteamID64                    │
│ [76561198012345678          ]│
│                              │
│ Nom RP                       │
│ [Jean Dupont                ]│
│                              │
│         [✅ Envoyer]         │
└──────────────────────────────┘
```

#### Chef remplit et clique "Envoyer"

**Bot affiche confirmation (éphémère):**
```
┌────────────────────────────────┐
│ ⚠️ Confirmer la liaison        │
├────────────────────────────────┤
│ Discord: @Jean                 │
│ SteamID64: `76561198012345678` │
│ Nom RP: **Jean Dupont**        │
└────────────────────────────────┘

[✅ Confirmer] [❌ Annuler]
```

#### Chef clique "✅ Confirmer"

**Succès (éphémère):**
```
┌────────────────────────────────┐
│ ✅ Liaison Enregistrée         │
├────────────────────────────────┤
│ ✅ @Jean est maintenant lié    │
│ avec le SteamID `7656119801`... │
│ et le nom RP **Jean Dupont**.  │
└────────────────────────────────┘
```

**Discord Audit Channel:**
```
┌────────────────────────────────┐
│ 🔗 Liaison                     │
├────────────────────────────────┤
│ 🔗 **Liaison Créée** -         │
│ @Chef a lié @Jean              │
│ (Steam: `76561198012345678`,   │
│ RP: **Jean Dupont**)           │
└────────────────────────────────┘
```

---

### Cas 2: Modifier une liaison existante

```
/link @Jean
```

**Réponse du bot:**
```
┌────────────────────────────────┐
│ 🔗 Panneau de Liaison          │
├────────────────────────────────┤
│ Discord: @Jean                 │
│ SteamID64: 76561198012345678   │
│ Nom RP: Jean Dupont            │
│ Statut: 🟢 Lié                │
│                                │
│ Los Esperados • Système        │
└────────────────────────────────┘

[🔗 Lier/Modifier] [🗑️ Supprimer] [❌ Annuler]
```

#### Chef clique sur "🔗 Lier/Modifier"

**Confirmation (éphémère):**
```
┌────────────────────────────────┐
│ ⚠️ Confirmer la liaison        │
├────────────────────────────────┤
│ Vous êtes sur le point de      │
│ lier @Jean.                    │
│                                │
│ **Données actuelles:**         │
│ • SteamID: `7656119801...`     │
│ • Nom RP: **Jean Dupont**      │
└────────────────────────────────┘

[✅ Continuer vers le formulaire] [❌ Annuler]
```

*Le modal pré-remplit les champs avec les données actuelles*

---

### Cas 3: Supprimer une liaison

```
/link @Jean
→ Clic sur [🗑️ Supprimer]
```

**Confirmation (éphémère):**
```
┌────────────────────────────────┐
│ ⚠️ Confirmer la suppression   │
├────────────────────────────────┤
│ Êtes-vous sûr de vouloir       │
│ supprimer la liaison de @Jean? │
│                                │
│ Cette action est irréversible. │
└────────────────────────────────┘

[🗑️ Confirmer la suppression] [❌ Annuler]
```

#### Chef clique "🗑️ Confirmer"

**Succès (éphémère):**
```
┌────────────────────────────────┐
│ 🗑️ Liaison Supprimée          │
├────────────────────────────────┤
│ La liaison de @Jean a été      │
│ supprimée.                     │
└────────────────────────────────┘
```

**Discord Audit Channel:**
```
┌────────────────────────────────┐
│ 🔗 Liaison                     │
├────────────────────────────────┤
│ 🗑️ **Liaison Supprimée** -    │
│ @Chef a supprimé la liaison    │
│ de @Jean                       │
└────────────────────────────────┘
```

---

### Cas 4: Annuler une action

```
/link @Jean
→ Clic sur [❌ Annuler]
```

**Réponse (éphémère):**
```
┌────────────────────────────────┐
│ ❌ Action Annulée              │
├────────────────────────────────┤
│ L'opération a été annulée.     │
└────────────────────────────────┘
```

*Les boutons du panel initial sont désactivés*

---

## `/unlink` - Suppression Directe

### Supprimer immédiatement

```
/unlink @Jean
```

**Confirmation (éphémère):**
```
┌────────────────────────────────┐
│ ⚠️ Confirmer la suppression   │
├────────────────────────────────┤
│ Êtes-vous sûr de vouloir       │
│ supprimer la liaison de @Jean? │
│                                │
│ Cette action est irréversible. │
└────────────────────────────────┘

[🗑️ Confirmer la suppression] [❌ Annuler]
```

#### Chef clique "🗑️ Confirmer"

**Succès (éphémère):**
```
┌────────────────────────────────┐
│ ✅ Liaison Supprimée           │
├────────────────────────────────┤
│ ✅ La liaison de @Jean a été   │
│ supprimée avec succès.         │
└────────────────────────────────┘
```

**Discord Audit Channel:**
```
┌────────────────────────────────┐
│ 🔗 Liaison                     │
├────────────────────────────────┤
│ 🗑️ **Liaison Supprimée** -    │
│ @Chef a supprimé la liaison    │
│ de @Jean via /unlink           │
└────────────────────────────────┘
```

---

## Messages d'Erreur

### Accès Refusé (pas Chef/État-Major)
```
❌ Accès Refusé

Seuls les Chef Famille ou État-Major peuvent 
utiliser cette commande.
```

### Auto-Liaison
```
❌ Auto-Liaison Interdite

Vous ne pouvez pas vous lier vous-même.
```

### SteamID64 Invalide
```
❌ SteamID64 Invalide

Le SteamID64 doit être un nombre à 17 chiffres.
```

### Nom RP Invalide
```
❌ Nom RP Invalide

Le nom RP doit être entre 1 et 50 caractères.
```

### Utilisateur Non Lié
```
❌ Erreur

Impossible de supprimer la liaison 
(utilisateur non lié?).
```

### Erreur Serveur
```
❌ Erreur

Une erreur s'est produite: [détails]
```

---

## Cas d'Erreur

### Erreur SteamID
```
[Remplit modal]
SteamID64: abc123  ← INVALIDE (pas 17 chiffres)
```
→ Message d'erreur → Peut réessayer

### Erreur Nom RP
```
[Remplit modal]
Nom RP: A  ← TROP COURT (besoin de plus)
```
→ Message d'erreur → Peut réessayer

### Erreur API
```
[Tente de lier]
→ Erreur serveur panel
```
→ Embed rouge d'erreur → Peut réessayer

---

## Notes

- 🔐 **Rôles**: Seuls Chef Famille et État-Major peuvent utiliser
- ⏱️ **Timeouts**: Les boutons expirent après 3 minutes (Discord native)
- 📝 **Logging**: Toutes les actions sont loggées dans le channel audit
- 🔄 **Confirmation**: Chaque étape importante demande confirmation
- 🔒 **Sécurité**: Impossible de se lier/délier soi-même
- 💾 **Données**: SteamID64 doit être valide, Nom RP 1-50 caractères

---

**Système Production Ready** ✅
