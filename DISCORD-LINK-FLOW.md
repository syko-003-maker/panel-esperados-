# Discord Link System - Flow Documentation

## 📋 Overview

The Discord Link system allows Staff (Chef/État-Major roles) to link Discord users to their SteamID64 and RP name directly from Discord.

**Key Features:**
- `/link @user` command to display link panel
- Button-driven UI with modal for data entry
- Direct API integration with dual authentication (session + secret)
- Real-time validation (SteamID64 format, RP name length)
- Proper error handling with user-friendly messages

---

## 🔐 Environment Variables

### Panel (Next.js)

Required in `.env.prod`:

```bash
# Family/Organization ID (must exist in Family table)
FAMILY_ID=esperados

# Worker authentication secret (shared with discord-worker)
INGEST_SECRET=your_secret_here_32_chars_min
```

### Discord Worker

Required in `discord-worker/.env.prod`:

```bash
# Panel base URL (no trailing slash)
INGEST_BASE_URL=https://losesperados.xyz

# Authentication secret (must match panel INGEST_SECRET)
INGEST_SECRET=your_secret_here_32_chars_min

# Discord bot token
DISCORD_TOKEN=your_bot_token_here
```

---

## 🛣️ API Endpoints

### Base URL: `/api/staff/link/[discordId]`

All endpoints support **dual authentication**:
1. **Worker**: `x-ingest-secret` header (Discord bot → Panel)
2. **Staff**: NextAuth session (Staff web UI → Panel)

---

### `GET /api/staff/link/:discordId`

Get member link data.

**Request:**
```bash
curl -X GET "https://losesperados.xyz/api/staff/link/123456789123456789" \
  -H "x-ingest-secret: your_secret_here" \
  -H "Content-Type: application/json"
```

**Response (200):**
```json
{
  "ok": true,
  "id": 42,
  "discordId": "123456789123456789",
  "steamId": "76561198012345678",
  "rpName": "Jean Dupont",
  "createdAt": "2025-01-01T12:00:00.000Z",
  "updatedAt": "2025-01-02T14:30:00.000Z"
}
```

**Response (404):**
```json
{
  "ok": false,
  "error": "NOT_FOUND"
}
```

---

### `POST /api/staff/link/:discordId`

Create or update member link.

**Request:**
```bash
curl -X POST "https://losesperados.xyz/api/staff/link/123456789123456789" \
  -H "x-ingest-secret: your_secret_here" \
  -H "Content-Type: application/json" \
  -d '{
    "steamId": "76561198012345678",
    "rpName": "Jean Dupont"
  }'
```

**Body Parameters:**
- `steamId` (required): SteamID64, must be 17 digits
- `rpName` (optional): RP name, 2-64 characters
- `age` (optional): Age (integer)

**Response (200):**
```json
{
  "ok": true,
  "discordId": "123456789123456789",
  "steamId": "76561198012345678",
  "rpName": "Jean Dupont",
  "memberId": 42
}
```

**Response (400 - Invalid SteamID):**
```json
{
  "ok": false,
  "error": "INVALID_STEAM_ID",
  "hint": "SteamID64 must be 17 digits"
}
```

**Response (400 - Invalid RP Name):**
```json
{
  "ok": false,
  "error": "INVALID_RP_NAME",
  "hint": "RP name must be 2-64 characters"
}
```

**Response (500 - DB Error):**
```json
{
  "ok": false,
  "error": "FK_CONSTRAINT_FAILED",
  "hint": "Family not found: esperados"
}
```

---

### `DELETE /api/staff/link/:discordId`

Delete member link.

**Request:**
```bash
curl -X DELETE "https://losesperados.xyz/api/staff/link/123456789123456789" \
  -H "x-ingest-secret: your_secret_here" \
  -H "Content-Type: application/json"
```

**Response (200):**
```json
{
  "ok": true,
  "message": "Link deleted successfully",
  "discordId": "123456789123456789"
}
```

**Response (404):**
```json
{
  "ok": false,
  "error": "NOT_FOUND"
}
```

---

## 🎮 Discord User Flow

### 1. Display Link Panel

Staff member runs: `/link @user`

**Result:**
- Embed displays current link status (Discord ID, SteamID64, RP Name)
- Two buttons: "Lier / Modifier" and "Supprimer"

---

### 2. Modify/Create Link

Staff clicks: **"Lier / Modifier"** button

**Flow:**
1. Button click → Modal opens **directly** (no intermediate message)
2. Modal shows two fields:
   - **SteamID64** (required, prefilled if exists)
   - **Nom RP** (required, prefilled if exists)
3. User submits modal
4. Discord worker validates:
   - SteamID64: must be 17 digits
   - RP Name: must be 2-50 characters
5. Discord worker calls `POST /api/staff/link/:discordId`
6. Panel API validates and upserts to database
7. Success: ephemeral message "✅ Liaison enregistrée"
8. Error: ephemeral message with specific error

**Important:**
- NO `deferUpdate()` or `deferReply()` before `showModal()`
- Modal submission uses `deferReply({ ephemeral: true })` then `editReply()`

---

### 3. Delete Link

Staff clicks: **"Supprimer"** button

**Flow:**
1. Confirmation prompt (ephemeral message with "Confirmer" button)
2. User clicks "Confirmer la suppression"
3. Discord worker calls `DELETE /api/staff/link/:discordId`
4. Panel API deletes from database
5. Success: ephemeral message "🗑️ Liaison supprimée"
6. Original panel buttons removed

---

## 🔧 Technical Details

### Database Schema (Prisma)

```prisma
model Family {
  slug    String   @id
  name    String
  members Member[]
}

model Member {
  id        Int      @id @default(autoincrement())
  familyId  String
  discordId String
  steamId   String?
  rpName    String?
  age       Int?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  family Family @relation(fields: [familyId], references: [slug])
  
  @@unique([familyId, discordId])
}
```

---

### Error Handling

**Panel API:**
- Always returns JSON (never HTML)
- Prisma errors caught and mapped:
  - `P2002`: Constraint violation (409)
  - `P2003`: FK constraint failed (500)
  - `P2025`: Record not found (404)
- Family existence guaranteed before upsert (prevents P2003)

**Discord Worker:**
- All API errors logged with structured data
- User-friendly error messages:
  - SteamID format: "Le SteamID64 doit être un nombre à 17 chiffres."
  - RP name: "Le nom RP doit être entre 1 et 50 caractères."
  - API error: "Impossible de créer/modifier la liaison."

---

## 🧪 Testing

### Test GET (curl)

```powershell
$headers = @{
  "x-ingest-secret" = "esperados_ingest_secret_prod_v1_2024"
  "Content-Type" = "application/json"
}

Invoke-RestMethod `
  -Uri "https://losesperados.xyz/api/staff/link/YOUR_DISCORD_ID" `
  -Method GET `
  -Headers $headers
```

### Test POST (curl)

```powershell
$headers = @{
  "x-ingest-secret" = "esperados_ingest_secret_prod_v1_2024"
  "Content-Type" = "application/json"
}

$body = @{
  steamId = "76561198012345678"
  rpName = "Jean Dupont"
} | ConvertTo-Json

Invoke-RestMethod `
  -Uri "https://losesperados.xyz/api/staff/link/YOUR_DISCORD_ID" `
  -Method POST `
  -Headers $headers `
  -Body $body
```

### Test DELETE (curl)

```powershell
$headers = @{
  "x-ingest-secret" = "esperados_ingest_secret_prod_v1_2024"
  "Content-Type" = "application/json"
}

Invoke-RestMethod `
  -Uri "https://losesperados.xyz/api/staff/link/YOUR_DISCORD_ID" `
  -Method DELETE `
  -Headers $headers
```

---

## 🚨 Common Issues

### Issue: "Unexpected token '<'" / HTML response

**Cause:** Panel returning HTML login page instead of JSON

**Fix:**
- Verify `INGEST_SECRET` matches in both `.env.prod` files
- Check `x-ingest-secret` header is sent correctly
- Verify Discord worker has `INGEST_BASE_URL` set

---

### Issue: "P2003: Foreign key constraint violated"

**Cause:** Family does not exist in database

**Fix:**
- Verify `FAMILY_ID` env var is set (default: "esperados")
- Panel API now auto-creates family on POST
- Check Family table has row with `slug = "esperados"`

---

### Issue: "The reply to this interaction has already been sent"

**Cause:** Incorrect `reply()`/`followUp()` sequence

**Fix:**
- For `showModal()`: NO defer before calling
- For other buttons: use `reply()` not `followUp()`
- For modal submit: `deferReply()` then `editReply()`

---

## 📝 Change Log

**2025-02-05:**
- Fixed button interaction flow (removed `deferUpdate()` before `showModal()`)
- Changed all button handlers from `followUp()` to `reply()`
- Added SteamID64 validation (17 digits regex)
- Added RP name validation (2-64 chars)
- Added Prisma error handling with try-catch
- Added FAMILY_ID check before upsert
- Updated API to always return JSON (never HTML)

---

## 🆘 Support

For issues or questions:
1. Check Discord worker logs: `docker logs discord-worker`
2. Check panel logs: `docker logs panel`
3. Verify environment variables are set correctly
4. Test API endpoints with curl examples above
