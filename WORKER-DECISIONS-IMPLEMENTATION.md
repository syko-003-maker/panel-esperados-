# IMPLÉMENTATION BOUTONS RECRUTEMENT/PLAINTE DANS WORKER DISCORD

## ✅ OBJECTIF ATTEINT

Support complet des boutons de décision recrutement/plainte dans le worker Discord avec:
- ACK rapide < 3s (deferUpdate)
- Appels API sécurisés avec INGEST_SECRET
- Mise à jour message Discord (embed + boutons disabled)
- Logs dans salon TICKETS_LOGS_CHANNEL_ID
- Logs JSON structurés via worker-obs

## 📋 MODIFICATIONS APPORTÉES

### 1. Worker Discord — ACK Rapide et Appels API

**Fichiers modifiés:**
- `discord-worker/src/recruitment-decision.ts`
- `discord-worker/src/complaint-decision.ts`

**Changements:**

#### ✅ ACK Immédiat (< 3s)
```typescript
// AVANT: interaction.reply() - pouvait timeout
await interaction.reply({ content: "...", ephemeral: true });

// APRÈS: deferUpdate() immédiat
try {
  await interaction.deferUpdate(); // ✅ ACK Discord < 500ms
} catch (ackError) {
  logError("recruitment_ack_failed", { customId }, ackError);
  return;
}
```

#### ✅ Authentication INGEST_SECRET
```typescript
// AVANT: Pas d'authentification
headers: { "Content-Type": "application/json" }

// APRÈS: Header sécurisé
headers: {
  "Content-Type": "application/json",
  "x-ingest-secret": process.env.INGEST_SECRET,
}
```

#### ✅ Paramètres Enrichis
```typescript
// AVANT: Body minimal
body: JSON.stringify({ ticketKey, decision, staffDiscordId })

// APRÈS: Contexte complet
body: JSON.stringify({
  ticketKey,
  decision,
  staffDiscordId,
  staffUsername,  // Pour logs
  messageId,      // Pour traçabilité
  channelId,      // Pour traçabilité
})
```

#### ✅ Gestion Interaction State
```typescript
// AVANT: interaction.reply() ou interaction.update()
await interaction.reply({ ... });
await interaction.update({ ... });

// APRÈS: deferUpdate() puis editReply() ou followUp()
await interaction.deferUpdate();           // ACK immédiat
// ... traitement API ...
await interaction.editReply({ ... });      // Update message
// ou
await interaction.followUp({ ephemeral: true }); // Message éphémère
```

### 2. Panel API — Sécurisation Routes

**Fichiers modifiés:**
- `app/api/discord/recruitment/decide/route.ts`
- `app/api/discord/complaint/decide/route.ts`

**Changements:**

#### ✅ Vérification INGEST_SECRET
```typescript
// AVANT: Pas d'authentification
export async function POST(req: Request) {
  const body = await req.json();
  // ...
}

// APRÈS: Vérification obligatoire
export async function POST(req: Request) {
  const ingestSecret = req.headers.get("x-ingest-secret");
  
  if (!INGEST_SECRET) {
    return NextResponse.json(
      { ok: false, error: "INGEST_SECRET not configured" },
      { status: 503 }
    );
  }
  
  if (ingestSecret !== INGEST_SECRET) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized: Invalid INGEST_SECRET" },
      { status: 401 }
    );
  }
  
  // Traitement autorisé...
}
```

#### ✅ Paramètres Supplémentaires
```typescript
// AVANT: Extraction minimale
const { ticketKey, decision, staffDiscordId } = body;

// APRÈS: Extraction complète
const { ticketKey, decision, staffDiscordId, staffUsername, messageId, channelId } = body;
```

### 3. Router Interactions — Déjà Implémenté

**Fichier:** `discord-worker/src/index.ts` (lignes 670-733)

Le routing était déjà en place:
```typescript
// Staff buttons - recruitment and complaint decisions
if (
  interaction.customId.startsWith(CUSTOM_ID.STAFF_RECRUIT_FINISH_PREFIX) ||
  interaction.customId.startsWith(CUSTOM_ID.STAFF_COMPLAINT_CLOSE_PREFIX) ||
  interaction.customId.startsWith("recruitment:decide:") ||
  interaction.customId.startsWith("complaint:decide:")
) {
  const isRecruitment = 
    interaction.customId.startsWith(CUSTOM_ID.STAFF_RECRUIT_FINISH_PREFIX) ||
    interaction.customId.startsWith("recruitment:decide:");
    
  if (isRecruitment) {
    return await handleRecruitmentDecision(interaction);
  } else if (isComplaint) {
    return await handleComplaintDecision(interaction);
  }
}
```

## 🎯 FORMATS CUSTOMID SUPPORTÉS

### Recrutement
- `recruitment:decide:APPROVE:<ticketKey>`
- `recruitment:decide:REFUSE:<ticketKey>`
- `ticket:recruitment:finish:<ticketKey>` (legacy, traité comme APPROVE)

### Plainte
- `complaint:decide:TRAITE:<ticketKey>`
- `complaint:decide:NON_RESOLU:<ticketKey>`
- `complaint:decide:REFUSE:<ticketKey>`
- `ticket:complaint:close:TRAITE:<ticketKey>` (legacy)
- `ticket:complaint:close:NON_RESOLU:<ticketKey>` (legacy)
- `ticket:complaint:close:REFUSE:<ticketKey>` (legacy)

## 🔒 SÉCURITÉ

### Authentification Machine-to-Machine
- Worker → Panel: Header `x-ingest-secret`
- Panel valide le secret avant traitement
- Retourne 401 si secret invalide
- Retourne 503 si secret non configuré

### Autorisation Staff
- Panel vérifie `Member.isActive = true`
- Panel vérifie `Member.gradeLevel >= 5` (STAFF)
- Retourne 403 si permissions insuffisantes

### Idempotence
- JobRun avec clé unique: `{TYPE}:${ticketKey}:${decision}`
- Prevents double execution (Discord retries, double clicks)
- Retry-safe: startJob() retourne false si déjà traité

## 📊 LOGS STRUCTURÉS

### Worker (worker-obs.ts)
```json
{"level":"info","event":"recruitment_decide_start","ticketKey":"R-20260206-ABC","decision":"APPROVE","staffDiscordId":"123","staffTag":"staff#1234"}
{"level":"info","event":"recruitment_decide_success","ticketKey":"R-20260206-ABC"}
{"level":"info","event":"recruitment_log_posted","ticketKey":"R-20260206-ABC","channelId":"456"}

{"level":"info","event":"complaint_decide_start","ticketKey":"C-20260206-XYZ","decision":"TRAITE"}
{"level":"info","event":"complaint_decide_success","ticketKey":"C-20260206-XYZ"}
```

### Panel (lib/obs.ts)
```json
{"event":"recruitment_decide_missing_params","requestId":"uuid"}
{"event":"recruitment_decide_unauthorized","requestId":"uuid","staffDiscordId":"123"}
{"event":"recruitment_decide_success","requestId":"uuid","ticketKey":"R-20260206-ABC"}

{"event":"complaint_decide_unauthorized_secret","requestId":"uuid"}
{"event":"complaint_decide_success","requestId":"uuid","ticketKey":"C-20260206-XYZ"}
```

## 🚀 FLOW COMPLET

### Recrutement: APPROVE
```
1. User clique "Approuver" dans Discord
   customId: "recruitment:decide:APPROVE:R-20260206-ABC"

2. Worker receive interaction
   [BUTTON] recruitment:decide:APPROVE:R-20260206-ABC user=123 channel=456

3. ACK immédiat (< 500ms)
   await interaction.deferUpdate()

4. Idempotence check
   JobRun.create({ jobKey: "RECRUITMENT_DECIDE:R-20260206-ABC:APPROVE" })

5. Call Panel API
   POST /api/discord/recruitment/decide
   Headers: { "x-ingest-secret": "..." }
   Body: { ticketKey, decision: "APPROVE", staffDiscordId: "123", ... }

6. Panel validate
   - Verify INGEST_SECRET ✓
   - Verify staff permissions ✓
   - Update Recruitment.status = "ACCEPTED" ✓

7. Worker update message
   await interaction.editReply({
     embeds: [decisionEmbed],      // ✅ Accepté (vert)
     components: [disabledButtons]  // Boutons grisés
   })

8. Worker post log
   TICKETS_LOGS_CHANNEL_ID: "📌 Recrutement Accepté • R-20260206-ABC"

9. Finish job
   JobRun.update({ status: "done" })
```

### Plainte: TRAITE
```
1. User clique "Traité" dans Discord
   customId: "complaint:decide:TRAITE:C-20260206-XYZ"

2. Worker ACK immédiat
   await interaction.deferUpdate()

3. Call Panel API
   POST /api/discord/complaint/decide

4. Panel update
   Complaint.status = "RESOLVED" ✓

5. Worker update message
   embeds: [✅ Traité]
   components: [disabled]

6. Log in channel
   TICKETS_LOGS_CHANNEL_ID: "📌 Plainte Traitée • C-20260206-XYZ"
```

## 🧪 TESTS DE VALIDATION

### Test 1: ACK < 3s
```bash
# Cliquer bouton recrutement
# Vérifier: Pas de "This interaction failed"
# Vérifier logs: [ACK_OK] recruitment:decide:...
```

### Test 2: API Auth
```bash
# Supprimer INGEST_SECRET du worker .env
# Cliquer bouton
# Vérifier: "❌ Erreur API: INGEST_SECRET not configured"
```

### Test 3: Permissions
```bash
# User sans gradeLevel >= 5
# Cliquer bouton
# Vérifier: "❌ Erreur API: Unauthorized"
```

### Test 4: Idempotence
```bash
# Double-clic rapide sur bouton
# Vérifier: Deuxième clic → "ℹ️ Cette décision a déjà été traitée"
# Vérifier DB: Un seul JobRun créé
```

### Test 5: Message Update
```bash
# Cliquer bouton APPROVE
# Vérifier: Embed vert "✅ Recrutement — Accepté"
# Vérifier: Boutons disabled (grisés)
```

### Test 6: Log Channel
```bash
# Cliquer bouton
# Vérifier: Message dans TICKETS_LOGS_CHANNEL_ID
# Format: "📌 Recrutement Accepté • R-20260206-ABC • Staff: @user"
```

## 📦 DÉPLOIEMENT

### Build
```bash
# Panel + Worker
npm run build

# Vérifier: "✓ Compiled successfully"
```

### Restart
```bash
# Worker
cd discord-worker
pm2 restart discord-worker

# Panel
pm2 restart panel
```

### Variables d'environnement requises
```bash
# Worker .env
INGEST_BASE_URL=https://losesperados.xyz
INGEST_SECRET=<secret>
TICKETS_LOGS_CHANNEL_ID=<channelId>

# Panel .env
INGEST_SECRET=<secret>  # DOIT MATCHER worker
```

## ✅ CHECKLIST FINAL

- [x] ACK rapide avec deferUpdate()
- [x] INGEST_SECRET dans appels API
- [x] Paramètres enrichis (staffUsername, messageId, channelId)
- [x] Vérification INGEST_SECRET dans routes panel
- [x] Autorisation staff (gradeLevel >= 5)
- [x] Update message Discord (embed + disabled buttons)
- [x] Post logs dans TICKETS_LOGS_CHANNEL_ID
- [x] Logs JSON structurés (worker-obs + lib/obs)
- [x] Idempotence via JobRun
- [x] Support formats legacy (ticket:recruitment:finish, ticket:complaint:close)
- [x] Gestion erreurs (API fail, permissions, timeouts)
- [x] Build successful (TypeScript 0 errors)

## 🎓 NOTES TECHNIQUES

### Pourquoi deferUpdate() au lieu de reply()?
- **deferUpdate()**: ACK invisible, message original editable
- **reply()**: Crée nouveau message, ne peut pas modifier original
- **Résultat**: Embed mis à jour in-place, UX propre

### Pourquoi editReply() après deferUpdate()?
- **interaction.deferUpdate()** → État "deferred"
- **interaction.editReply()** → Modifie message original
- **interaction.update()** → Erreur si déjà deferred

### Pourquoi INGEST_SECRET?
- Protège routes panel contre appels externes
- Worker = machine-to-machine auth
- NextAuth session = user-facing auth
- Deux systèmes d'auth différents, deux cas d'usage

---

**Status:** ✅ Implémentation complète  
**Build:** ✅ Compilé avec succès (6.0s)  
**Tests:** ⏳ En attente validation utilisateur  
**Date:** 2026-02-06
