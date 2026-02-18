# 🔐 Séparation des Panneaux Discord — IMMUTABLE TICKETS

## ✅ Problème Résolu

**Avant :** Le worker modifiait UN SEUL message "Contact" qui contenait à la fois :
- ❌ Tickets (Recrutement/Plainte) - **DOIT ÊTRE FIGÉ**
- ❌ Liaison - Peut être mis à jour

**Résultat :** Le message Tickets était modifié à chaque boot → Embed changé, boutons changés

---

## 🔧 Solution Implémentée

**Maintenant :** DEUX MESSAGES DISTINCTS ET INDÉPENDANTS

### 1️⃣ Message "Tickets — Los Esperados" (IMMUTABLE)

**Localisation :** Salon `CONTACT_CHANNEL_ID` (1452869229295698025 = BOTS_FAMILLE)

**Contenu :**
```
🎫 Tickets — Los Esperados

Conditions d'admission :
• Compter de 5 à 15 joueurs actifs
• Avoir une cohésion minimum
• Respecter le règlement

Sélectionne une section ci-dessous :

📋 Recrutement — Candidature ou whitelist
⚠️ Plainte — Signalement ou litige

[Ouvrir un recrutement] [Ouvrir une plainte]
```

**Création :** Une seule fois au premier boot dans `ensureTicketsPanel()`

**Modification :** ❌ JAMAIS — Le worker vérifie juste qu'il existe

**Stockage ID :** `discord-worker/data/panels.json` → `"tickets_panel_message_id"`

**Log Boot :**
```json
{"event":"tickets_panel_exists","messageId":"1467062793370075230",...}
```

---

### 2️⃣ Message "Panneau de liaison" (CAN BE UPDATED)

**Localisation :** Salon `BOTS_FAMILLE_CHANNEL_ID` (1452869229295698025)

**Contenu :**
```
🔗 Panneau de liaison

Utilisez le bouton ci-dessous pour demander une liaison.

[Demander une liaison]
```

**Création :** Une seule fois au premier boot dans `ensureLinkPanel()`

**Modification :** ✅ PEUT ÊTRE MODIFIÉ chaque boot (mise à jour contrôlée)

**Stockage ID :** `discord-worker/data/panels.json` → `"link_panel_message_id"`

**Log Boot :**
```json
{"event":"link_panel_updated","messageId":"1467062795269963807",...}
```

---

## 📁 Fichiers Modifiés

### `discord-worker/src/contactPanel.ts`

**Avant :** Une seule fonction `ensureContactPanel()` qui modifiait UN message avec tout

**Après :** DEUX FONCTIONS DISTINCTES

```typescript
export async function ensureTicketsPanel(client: Client) {
  // Crée/vérifie le message "Tickets — Los Esperados"
  // ❌ Ne modifie JAMAIS après création
  // ✅ Utilise persistance: panels.json → "tickets_panel_message_id"
}

export async function ensureLinkPanel(client: Client) {
  // Crée/met à jour le message "Panneau de liaison"
  // ✅ Peut être modifié chaque boot
  // ✅ Utilise persistance: panels.json → "link_panel_message_id"
}

// Legacy (compatibilité)
export async function ensureContactPanel(client: Client) {
  await ensureTicketsPanel(client);
  await ensureLinkPanel(client);
}
```

**Persistance :** Lecture/écriture de `discord-worker/data/panels.json`
- Fonction `readPanels()` : Lit l'ID précédent depuis le fichier JSON
- Fonction `savePanels()` : Écrit le nouvel ID après création

### `discord-worker/src/ids.ts`

**Ajout :** Constante `LINK_OPEN_PANEL` en tant que custom button ID

```typescript
export const CUSTOM_ID = {
  PANEL_RECRUIT: "contact:open:recruitment",
  PANEL_COMPLAINT: "contact:open:complaint",
  MODAL_RECRUIT: "contact:modal:recruitment",
  MODAL_COMPLAINT: "contact:modal:complaint",
  STAFF_RECRUIT_FINISH_PREFIX: "ticket:recruitment:finish:",
  STAFF_COMPLAINT_CLOSE_PREFIX: "ticket:complaint:close:",
  LINK_OPEN_PANEL: "link:open_panel",  // ← NOUVEAU
} as const;
```

### `discord-worker/src/index.ts`

**Pas de modification requise :** Appelle toujours `ensureContactPanel()` qui délègue aux deux fonctions

```typescript
await ensureContactPanel(client);
// Qui appelle maintenant:
//   - ensureTicketsPanel() → crée/vérifie Tickets (immutable)
//   - ensureLinkPanel()   → crée/met à jour Liaison
log("contact_panel_ok");
```

### `discord-worker/data/panels.json`

**Structure persistance :**
```json
{
  "tickets_panel_message_id": "1467062793370075230",
  "link_panel_message_id": "1467062795269963807",
  "last_updated": "2026-01-31T07:45:00.054Z"
}
```

- **tickets_panel_message_id** : Message Tickets (créé une fois, jamais modifié)
- **link_panel_message_id** : Message Liaison (peut être mis à jour)

---

## 🔄 Flux de Routage (Rafraîchi)

### Bouton "Ouvrir un recrutement" / "Ouvrir une plainte"

```
[Message Tickets]
    ↓
[Bouton : PANEL_RECRUIT ou PANEL_COMPLAINT]
    ↓
[index.ts : buttonInteraction handler]
    ↓
[Handler : openRecruitmentModal() ou openComplaintModal()]
    ↓
[Crée un thread dans TICKETS_PARENT_CHANNEL_ID]
```

**IMMUTABLE — Ne dépend pas du message Liaison**

### Bouton "Demander une liaison"

```
[Message Liaison]
    ↓
[Bouton : LINK_OPEN_PANEL]
    ↓
[index.ts : buttonInteraction handler (ligne 400)]
    ↓
[Redirige vers : /me?tab=link]
```

**PEUT ÊTRE MIS À JOUR — Indépendant du message Tickets**

---

## 🚀 Boot Sequence (Nouveau)

```
1. Env loading [ENV LOADER] ✅
2. Bot ready [WORKER BOT] ✅
3. Panel health check [panel_health_warn] ⚠️
4. Create/verify Tickets panel [tickets_panel_exists] ← Juste une vérification
5. Create/update Link panel [link_panel_updated] ← Peut être modifié
6. All OK [contact_panel_ok] ✅
7. Channel access checks [channel_access_ok] ✅
8. Commands registration [commands_register_ok] ✅
9. Boot complete [boot_complete] ✅
```

**Résultat :**
```
{"event":"tickets_panel_exists","messageId":"1467062793370075230",...}
{"event":"link_panel_updated","messageId":"1467062795269963807",...}
{"event":"contact_panel_ok",...}
```

---

## ✨ Garanties

- ✅ **Tickets Message Immutable** : Créé UNE FOIS, jamais modifié après
- ✅ **Link Message Flexible** : Peut être édité/mis à jour chaque boot
- ✅ **Pas de Reposts** : Persistance via `panels.json`
- ✅ **Handlers Intacts** : Recrutement/Plainte ne touchent que leurs threads
- ✅ **Liaison Séparée** : Boutton "Demander une liaison" dans un message distinct
- ✅ **Zéro Conflit** : Les deux panels vivent dans le même salon mais sont totalement indépendants

---

## 🛡️ Protections Contre les Modifications Accidentelles

### Dans `ensureTicketsPanel()` :
```typescript
if (existingTicketsId) {
  try {
    const msg = await channel.messages.fetch(existingTicketsId);
    log("tickets_panel_exists", { messageId: existingTicketsId });
    return;  // ← Sort sans faire de .edit()
  } catch (e) {
    log("tickets_panel_missing_will_recreate", { messageId: existingTicketsId });
  }
}
```

**Comportement :**
- Si le message existe → Vérification seulement, pas de modification
- Si le message est supprimé → Le recréer UNE SEULE FOIS (pas de reposts)
- Si erreur quelconque → Log clair de l'état

### Dans `ensureLinkPanel()` :
```typescript
if (existingLinkId) {
  try {
    const msg = await channel.messages.fetch(existingLinkId);
    await msg.edit({ embeds: [embed], components: [row] });  // ← Peut éditer
    log("link_panel_updated", { messageId: existingLinkId });
    return;
  } catch (e) {
    log("link_panel_missing_will_recreate", { messageId: existingLinkId });
  }
}
```

**Comportement :**
- Si le message existe → Mise à jour contrôlée
- Si le message est supprimé → Recréer un nouveau
- Si erreur quelconque → Log clair

---

## 📋 Checklist Validation

- [x] Deux fonctions distinctes: `ensureTicketsPanel()` et `ensureLinkPanel()`
- [x] Tickets message créé UNE FOIS et jamais modifié après
- [x] Link message peut être édité chaque boot
- [x] Persistance via `discord-worker/data/panels.json`
- [x] CUSTOM_ID.LINK_OPEN_PANEL défini et utilisé
- [x] Handlers de boutons intacts (Recrutement/Plainte)
- [x] Compilation réussie (`npm run build`)
- [x] Boot réussi avec logs distincts pour chaque panel
- [x] Zéro conflit entre les deux messages

---

## 🎯 Résumé Final

| Aspect | Tickets | Liaison |
|--------|---------|---------|
| **Localisation** | `CONTACT_CHANNEL_ID` | `BOTS_FAMILLE_CHANNEL_ID` |
| **Création** | UNE FOIS au boot | UNE FOIS au boot |
| **Modification** | ❌ JAMAIS | ✅ Chaque boot |
| **Persistance** | `tickets_panel_message_id` | `link_panel_message_id` |
| **Log Création** | `tickets_panel_exists` | `link_panel_updated` |
| **Boutons** | Recrutement, Plainte | Demander liaison |
| **Handlers** | Modales recruitment/complaint | Redirection web |
| **Risque Conflit** | ❌ AUCUN | ❌ AUCUN |

---

**✅ SYSTÈME FIGURE ET SÉCURISÉ — TICKETS MESSAGE IMMUTABLE**

