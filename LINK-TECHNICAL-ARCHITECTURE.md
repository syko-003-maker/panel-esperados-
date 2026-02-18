# Architecture Technique - Système de Liaison

## Structure du Code

### 📂 Fichiers Impliqués

```
discord-worker/src/
├── link.ts              ← 🆕 Système de liaison complet (950+ lignes)
├── commands.ts          ← ✏️ Modifié (imports + routes)
├── index.ts            ← ✏️ Modifié (button/modal handlers)
└── ids.ts              ← Existant (IDS.TICKETS_LOGS_CHANNEL_ID)
```

---

## [discord-worker/src/link.ts](discord-worker/src/link.ts) - Vue d'ensemble

### Exports (Publics)

```typescript
export function createLinkCommand()
export function createUnlinkCommand()
export async function handleLinkCommand(interaction)
export async function handleUnlinkCommand(interaction)
export async function handleLinkButtonInteraction(interaction, client)
export async function handleUnlinkButtonInteraction(interaction, client)
export async function handleLinkModalSubmission(interaction, client)
export const LINK_CUSTOM_IDS = {...}
```

### Types

```typescript
interface MemberLinkData {
  discordId: string;
  steamId: string | null;
  rpName: string | null;
}

interface PanelLinkResponse {
  ok: boolean;
  discordId: string;
  steamId: string;
  rpName: string;
  memberId: string;
}

interface PanelLinkError {
  ok: false;
  error: string;
  details?: string;
}
```

### Custom IDs

```typescript
LINK_CUSTOM_IDS = {
  LINK_BUTTON: "link:action:modify",           // Initial panel
  DELETE_BUTTON: "link:action:delete",         // Initial panel
  CANCEL_BUTTON: "link:action:cancel",         // Initial panel
  CONFIRM_LINK_BUTTON: "link:confirm:link",    // Confirmation embed
  CONFIRM_DELETE_BUTTON: "link:confirm:delete",// Confirmation embed
  LINK_MODAL: "link:modal:data",               // Form submission
  STEAM_ID_INPUT: "link:input:steamid",        // Modal field
  RP_NAME_INPUT: "link:input:rpname",          // Modal field
}
```

#### Format des IDs avec contexte
```
link:action:modify:DISCORD_ID          // Bouton Lier (initial)
link:action:delete:DISCORD_ID          // Bouton Supprimer (initial)
link:action:cancel:DISCORD_ID          // Bouton Annuler (initial)
link:confirm:link:DISCORD_ID           // Bouton Confirmer liaison
link:confirm:delete:DISCORD_ID         // Bouton Confirmer suppr.
link:modal:data:DISCORD_ID             // Modal submission
unlink:confirm:DISCORD_ID              // Bouton Confirmer unlink
unlink:cancel:DISCORD_ID               // Bouton Annuler unlink
```

---

## Flow Diagrams

### /link Flow (Complet)

```
┌──────────────────────────────────────────────────────────┐
│ User: /link @Jean                                        │
└─────────────────────┬──────────────────────────────────┘
                      │
                      ├─ Role check: hasChefRole()?
                      │  ├─ ❌ NO → Embed rouge + ephemeral
                      │  └─ ✅ YES → Continuer
                      │
                      ├─ Self-link check: user === target?
                      │  ├─ ❌ YES → Embed rouge + ephemeral
                      │  └─ ✅ NO → Continuer
                      │
                      ├─ API: getMemberLinkData(targetId)
                      │
                      └─ Panel Initial
                         ├─ Embed bleu (data ou "Non lié")
                         └─ 3 Boutons
                            ├─ [🔗 Lier/Modifier]
                            ├─ [🗑️ Supprimer]
                            └─ [❌ Annuler]

┌─ User: [❌ Annuler]
├─ Button ID: "link:action:cancel:DISCORD_ID"
├─ Role check: hasChefRole()
├─ Disable all buttons on original message
└─ Ephemeral: "Action Annulée"

┌─ User: [🔗 Lier/Modifier]
├─ Button ID: "link:action:modify:DISCORD_ID"
├─ Role check: hasChefRole()
├─ API: getMemberLinkData()
│
└─ Confirmation Embed (Orange)
   ├─ Show current data if exists
   ├─ [✅ Continuer vers formulaire]
   └─ [❌ Annuler]

   ┌─ User: [✅ Continuer]
   ├─ Button ID: "link:confirm:link:DISCORD_ID"
   ├─ Role check: hasChefRole()
   ├─ Show Modal:
   │  ├─ SteamID64 (17 digits, prepopulated)
   │  └─ Nom RP (1-50 chars, prepopulated)
   │
   └─ User: [Remplit + Envoyer]
      ├─ Modal ID: "link:modal:data:DISCORD_ID"
      ├─ Role check: hasChefRole()
      │
      ├─ Validate SteamID64: /^\d{17}$/
      │  └─ ❌ Invalid → Embed rouge + ephemeral + return
      │
      ├─ Validate Nom RP: 1-50 chars
      │  └─ ❌ Invalid → Embed rouge + ephemeral + return
      │
      ├─ Show Confirmation Embed (Orange)
      │  ├─ Récapitulatif
      │  ├─ [✅ Confirmer]
      │  └─ [❌ Annuler]
      │
      └─ User: [✅ Confirmer]
         ├─ Button ID: "link:confirm:link:DISCORD_ID"
         ├─ Role check: hasChefRole()
         ├─ API: updateMemberLink(targetId, steamId, rpName)
         │  └─ POST /api/staff/link
         │
         └─ Success Embed (Green) + Disable buttons
            └─ Log to audit channel
```

### /unlink Flow (Direct)

```
┌──────────────────────────────────────────────────────────┐
│ User: /unlink @Jean                                      │
└─────────────────────┬──────────────────────────────────┘
                      │
                      ├─ Role check: hasChefRole()
                      │  ├─ ❌ NO → Embed rouge
                      │  └─ ✅ YES → Continuer
                      │
                      ├─ Self-link check: user === target?
                      │  ├─ ❌ YES → Embed rouge
                      │  └─ ✅ NO → Continuer
                      │
                      └─ Confirmation Embed (Red)
                         ├─ "Êtes-vous sûr?"
                         ├─ [🗑️ Confirmer la suppression]
                         └─ [❌ Annuler]

┌─ User: [🗑️ Confirmer]
├─ Button ID: "unlink:confirm:DISCORD_ID"
├─ Role check: hasChefRole()
├─ API: deleteMemberLink(targetId)
│  └─ DELETE /api/staff/link/{targetId}
│
└─ Success Embed (Green)
   └─ Log to audit channel

┌─ User: [❌ Annuler]
└─ Button ID: "unlink:cancel:DISCORD_ID"
   └─ Disabled buttons + Embed gris
```

### Delete Button Flow (depuis panel)

```
User: [🗑️ Supprimer] (depuis panel initial)
│
├─ Button ID: "link:action:delete:DISCORD_ID"
├─ Role check: hasChefRole()
│
└─ Confirmation Embed (Red)
   ├─ [🗑️ Confirmer la suppression]
   └─ [❌ Annuler]

   ┌─ User: [🗑️ Confirmer]
   ├─ Button ID: "link:confirm:delete:DISCORD_ID"
   ├─ Role check: hasChefRole()
   ├─ API: deleteMemberLink(targetId)
   │
   └─ Success Embed (Red) + Disable buttons on original
      └─ Log to audit channel
```

---

## Functions Privées

### API Client

```typescript
async function panelFetch(
  path: string,
  options: RequestInit = {}
): Promise<any>
```
- Bearer token auto-add
- Timeout: 10s
- Returns response or null

### API Endpoints

```typescript
async function getMemberLinkData(discordId: string): Promise<MemberLinkData | null>
  // GET /api/staff/link/{discordId}

async function updateMemberLink(
  discordId: string,
  steamId: string,
  rpName: string
): Promise<PanelLinkResponse | null>
  // POST /api/staff/link
  // Body: {discordId, steamId, rpName}

async function deleteMemberLink(discordId: string): Promise<PanelLinkResponse | null>
  // DELETE /api/staff/link/{discordId}
```

### Authorization

```typescript
async function hasChefRole(
  interaction: ChatInputCommandInteraction | ButtonInteraction | ModalSubmitInteraction
): Promise<boolean>
```
- Check IDS.STAFF_ROLE_ID if configured
- Fallback: Check PermissionFlagsBits.ManageRoles
- Works for all interaction types

### Embed Builders

```typescript
function createLinkPanelEmbed(discordId: string, data?: MemberLinkData): EmbedBuilder
function createSuccessEmbed(title: string, description: string): EmbedBuilder
function createErrorEmbed(title: string, error: string): EmbedBuilder
function createDeletedEmbed(discordId: string): EmbedBuilder
function createConfirmationEmbed(title: string, description: string, color: number): EmbedBuilder
function createCancelledEmbed(): EmbedBuilder
```

### Form

```typescript
function createLinkModal(
  discordId: string,
  currentData: MemberLinkData | null
): ModalBuilder
```
- Pre-populates with current data
- SteamID64: Short, required, placeholder
- Nom RP: Short, required, max 50

### Logging

```typescript
async function logToChannel(client: Client, message: string): Promise<void>
```
- Fetches TICKETS_LOGS_CHANNEL_ID
- Creates embed with message
- Logs errors to console

---

## Integration Points

### In [commands.ts](discord-worker/src/commands.ts)

```typescript
// Imports
import {
  createLinkCommand,
  handleLinkCommand,
  createUnlinkCommand,
  handleUnlinkCommand,
  handleLinkButtonInteraction,
  handleUnlinkButtonInteraction,
  LINK_CUSTOM_IDS,
}

// Commands array
createLinkCommand(),
createUnlinkCommand(),

// Handler switch
case "link":
  return handleLinkCommand(interaction);
case "unlink":
  return handleUnlinkCommand(interaction);
```

### In [index.ts](discord-worker/src/index.ts)

```typescript
// Imports
import {
  handleLinkButtonInteraction,
  handleLinkModalSubmission,
  handleUnlinkButtonInteraction,
  LINK_CUSTOM_IDS,
}

// Button handlers
if (
  interaction.customId.startsWith(LINK_CUSTOM_IDS.LINK_BUTTON) ||
  interaction.customId.startsWith(LINK_CUSTOM_IDS.DELETE_BUTTON) ||
  interaction.customId.startsWith(LINK_CUSTOM_IDS.CANCEL_BUTTON) ||
  interaction.customId.startsWith(LINK_CUSTOM_IDS.CONFIRM_LINK_BUTTON) ||
  interaction.customId.startsWith(LINK_CUSTOM_IDS.CONFIRM_DELETE_BUTTON)
)
  return handleLinkButtonInteraction(interaction, client);

if (
  interaction.customId.startsWith("unlink:confirm:") ||
  interaction.customId.startsWith("unlink:cancel:")
)
  return handleUnlinkButtonInteraction(interaction, client);

// Modal handlers
if (interaction.customId.startsWith(LINK_CUSTOM_IDS.LINK_MODAL))
  return handleLinkModalSubmission(interaction, client);
```

---

## Error Handling

### Role Check Errors
- → Embed rouge "Accès Refusé"
- → Ephemeral true
- → Log: `link_command_denied`, reason: "Not chef role"

### Self-Link Errors
- → Embed rouge "Auto-Liaison Interdite"
- → Ephemeral true
- → Log: `link_command_denied`, reason: "Self link attempt"

### Validation Errors
- → Embed rouge avec détail (SteamID ou Nom RP)
- → Ephemeral true (for modals)
- → User can retry

### API Errors
- → Embed rouge "Une erreur s'est produite"
- → Show error message
- → Log: `link_submit_error` with error details
- → Log to console with stack trace

### Channel Logging Errors
- → Silently log to console
- → Don't break main interaction
- → Log: `log_to_channel_error`

---

## Event Flow

### Button Interaction
1. Discord emits `interactionCreate`
2. `index.ts` checks `customId.startsWith(...)`
3. Routes to `handleLinkButtonInteraction()` or `handleUnlinkButtonInteraction()`
4. Handler calls `hasChefRole()`
5. Handler performs action (show confirm, show modal, execute delete)
6. Log to console + Discord channel

### Modal Submission
1. Discord emits `interactionCreate`
2. `index.ts` checks `customId.startsWith(LINK_CUSTOM_IDS.LINK_MODAL)`
3. Routes to `handleLinkModalSubmission()`
4. Handler validates SteamID64 and Nom RP
5. Handler shows confirmation embed
6. User clicks confirm button
7. Handler calls API `updateMemberLink()`
8. Log success + Discord channel

---

## Logging Events

### Console (JSON)
```json
{
  "event": "link_command_start",
  "userId": "123456",
  "targetId": "654321",
  "guildId": "999",
  "timestamp": "2026-01-31T12:34:56.789Z"
}
```

### Discord Audit Channel
```
🔗 Liaison

🔗 **Liaison Créée** - @Chef a lié @Jean 
(Steam: `76561198012345678`, RP: **Jean Dupont**)
```

### All Events
- `link_command_start`, `link_command_ok`, `link_command_denied`
- `link_button_click`, `link_confirmation_shown`, `link_modal_shown`
- `link_submit_ok`, `link_submit_error`, `link_submit_validation_error`
- `link_delete_ok`, `link_delete_failed`, `link_delete_error`
- `unlink_command_start`, `unlink_confirmation_shown`
- `unlink_delete_ok`, `unlink_delete_failed`

---

## Configuration

### Environment Variables
```env
INGEST_BASE_URL          # Panel API URL (or PANEL_BASE_URL)
INGEST_SECRET            # Bearer token (or DISCORD_WORKER_SECRET)
TICKETS_LOGS_CHANNEL_ID  # Audit log channel
GUILD_ID                 # Discord guild
STAFF_ROLE_ID            # Chef/State-Major role (optional)
```

### discord.js v14 Requirements
- SlashCommandBuilder
- ButtonBuilder, ActionRowBuilder
- ModalBuilder, TextInputBuilder
- EmbedBuilder
- ChatInputCommandInteraction, ButtonInteraction, ModalSubmitInteraction

---

## Production Checklist

- ✅ TypeScript compilation: 0 errors
- ✅ All handlers export properly
- ✅ All custom IDs consistent
- ✅ Error messages user-friendly
- ✅ Logging structured (JSON)
- ✅ No memory leaks (no collectors without timeout)
- ✅ API timeouts (10s)
- ✅ Role checks on every interaction
- ✅ Self-link prevention
- ✅ Validation strict (SteamID64: 17 digits exact)

---

**Version**: 1.0.0
**Status**: Production Ready ✅
**Last Updated**: 31 Janvier 2026
