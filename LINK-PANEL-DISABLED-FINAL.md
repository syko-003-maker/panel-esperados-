# 🔗 Liaison Discord — Remise en Ordre SITE-ONLY

## ✅ CHANGEMENT CRITIQUE APPLIQUÉ

**Le "Panneau de Liaison" N'EST PLUS JAMAIS POSTÉ SUR DISCORD**

---

## 📋 Ce qui a été fait

### 1. Désactivation du Panneau de Liaison sur Discord
**Fichier :** `discord-worker/src/contactPanel.ts`

**Avant :**
```typescript
export async function ensureContactPanel(client: Client) {
  await ensureTicketsPanel(client);
  await ensureLinkPanel(client);  // ← Postait le link-panel sur Discord
}
```

**Après :**
```typescript
export async function ensureContactPanel(client: Client) {
  await ensureTicketsPanel(client);
  // await ensureLinkPanel(client); // ❌ DISABLED — Link panel must not appear on Discord
}
```

**Résultat :**
- ❌ Le worker NE poste PLUS jamais le "Panneau de liaison" sur Discord
- ✅ Seul le message "Tickets — Los Esperados" (Recrutement/Plainte) est géré par le worker
- ✅ Aucun bouton "Ouvrir le panneau de liaison" sur Discord

---

## 🌐 Liaison Basée Exclusivement sur le SITE

### Flux de Liaison (À partir du SITE uniquement)

```
1. L'utilisateur NON LIÉ se rend sur : https://losesperados.xyz/me
2. Clique sur "Contacter le staff" (ou équivalent)
3. Remplir le formulaire de liaison
4. Soumettre
        ↓
5. [API] POST /api/contact/link-request
        ↓
6. Validation :
   - Session utilisateur ✅
   - Utilisateur NON LIÉ ✅
   - Cooldown 5 minutes ✅
        ↓
7. [Discord] Message envoyé dans BOTS_FAMILLE_CHANNEL_ID (1452869229295698025)
   - Contenu : Embed avec les infos utilisateur
   - Boutons : Traiter / Refuser / Archiver
   - Pings : @Recruteur @Chef_Famille @État-Major
        ↓
8. [Staff] Traite la demande sur Discord (boutons d'action)
        ↓
9. [Utilisateur] Notification dans son DM ou sur le panel
```

---

## 📨 Format du Message Discord (Liaison)

**Endpoint :** `POST /api/contact/link-request`  
**Salon :** `BOTS_FAMILLE_CHANNEL_ID = 1452869229295698025`  
**Token :** `DISCORD_BOT_TOKEN`

**Rôles Pingés :**
- Recruteur: `1312845999215214618`
- Chef Famille: `1429607761720770623`
- État-Major: `1312845999366209683`

**Contenu Embed :**
```
🔗 Demande de liaison
Nouvel utilisateur demande une liaison de compte

Utilisateur Discord: @Username (Discord ID: 123456789)
Discord ID: `123456789`
État: 🔴 En attente
Date: [timestamp formaté]
Lien Panel: [Aller à /me]
```

**Boutons :**
- `✅ Traiter` → Ouvre le formulaire de traitement
- `❌ Refuser` → Refuse la demande
- `💤 Archiver` → Archive la demande

---

## 🎫 Message Tickets — INTOUCHÉ

**Fichier :** `discord-worker/src/contactPanel.ts`  
**Fonction :** `ensureTicketsPanel()` - **TOUJOURS ACTIF**

**Localisation :** Salon `CONTACT_CHANNEL_ID = BOTS_FAMILLE_CHANNEL_ID (1452869229295698025)`

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

**Comportement :**
- ✅ Créé UNE FOIS au premier boot
- ✅ Jamais modifié après
- ✅ Boutons fonctionnels pour recrutement/plainte
- ❌ Aucun interaction liée à la liaison

---

## 🔐 Logs de Boot (Nouveau)

**Avant (Ancien) :**
```json
{"event":"tickets_panel_exists",...}
{"event":"link_panel_updated",...}           ← SUPPRIMÉ
{"event":"contact_panel_ok",...}
```

**Après (Nouveau) :**
```json
{"event":"tickets_panel_created",...}        ← Ou "exists" si déjà créé
{"event":"contact_panel_ok",...}
```

**Vérification :** Aucune mention de `link_panel` dans les logs = ✅ Correct

---

## 🚫 Ce qui N'existe PLUS

- ❌ Message "Panneau de liaison" sur Discord
- ❌ Bouton "Demander une liaison" sur Discord
- ❌ Fonction `ensureLinkPanel()` appelée au boot
- ❌ Persistance de `link_panel_message_id` utilisée
- ❌ Logs `link_panel_created` ou `link_panel_updated`

---

## ✅ Ce qui Fonctionne Toujours

- ✅ Message Tickets (Recrutement/Plainte) intact
- ✅ API `/api/contact/link-request` envoie Discord msg
- ✅ Pings des rôles pour liaison
- ✅ Boutons d'action (Traiter/Refuser/Archiver) fonctionnels
- ✅ Cooldown anti-spam (5 minutes)
- ✅ Tous les handlers de tickets intacts

---

## 🔍 Vérification

### Compilation
```bash
npm run build
# ✅ Sans erreurs TypeScript
```

### Boot
```bash
npm run start
# ✅ Logs correctement structurés
# ❌ Aucune ligne avec "link_panel"
# ✅ "contact_panel_ok" affiché
# ✅ "tickets_panel_created" ou "exists" affiché
```

### Interactions Discord
- ❌ Aucun bouton "Demander une liaison" visible
- ✅ Message Tickets visible avec ses 2 boutons
- ✅ API génère automatiquement les messages (pas de boutons Discord pour l'initier)

---

## 🎯 Résumé Final

| Aspect | Avant | Après |
|--------|-------|-------|
| **Panneau Liaison Discord** | Posté au boot | ❌ SUPPRIMÉ |
| **Message Liaison** | Editable chaque boot | ❌ JAMAIS CRÉÉ |
| **Liaison depuis Discord** | Via bouton | ❌ IMPOSSIBLE |
| **Liaison depuis Site** | Via API | ✅ FONCTIONNE |
| **Message Tickets** | Créé au boot | ✅ TOUJOURS LÀ |
| **Boutons Recrutement/Plainte** | Fonctionnels | ✅ INTACTS |
| **Notification Staff** | Via Discord Message | ✅ AUTOMAT. PAR API |

---

## 📞 Points de Contact

**Liaison utilisateur** → Site UNIQUEMENT → `/me` page → Bouton "Contacter"  
**Notification staff** → `/api/contact/link-request` → Discord msg auto  
**Gestion liaison staff** → Boutons Discord (Traiter/Refuser/Archiver)  
**Tickets recrutement/plainte** → Toujours via message Discord

---

**✅ LIAISON DÉSORMAIS SITE-ONLY — DISCORD NOTIFIE UNIQUEMENT**

