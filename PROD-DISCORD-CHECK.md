# Discord Bot Production Configuration Check

## Overview

This checklist ensures your Discord bot is properly configured and authorized to manage sanctions.

## Discord Developer Portal Setup

### 1. Bot Creation & Token

**Location:** https://discord.com/developers/applications > Your Bot > Bot

**Configure:**
- [ ] Bot is created and exists in Developer Portal
- [ ] Bot token copied and set as `DISCORD_BOT_TOKEN` (never commit)
- [ ] Token is recent (regenerate if unsure of age)

**Verify:**
```bash
# Bot should respond to:
GET https://discord.com/api/v10/users/@me
Authorization: Bot YOUR_TOKEN

# Should return your bot's user object (status 200)
```

### 2. Bot Intents

**Location:** https://discord.com/developers/applications > Your Bot > Bot > Intents

**Required Intents:**
- [ ] **Privileged Intents:**
  - [ ] `GUILD_MEMBERS` - Needed to fetch member roles
  - [ ] `MESSAGE_CONTENT` - Optional, for command handling
- [ ] **Standard Intents:**
  - [ ] `GUILDS` - Member access
  - [ ] `GUILD_ROLES` - Role management
  - [ ] `DIRECT_MESSAGES` - DM handling (optional)

### 3. Bot Permissions

**Location:** https://discord.com/developers/applications > Your Bot > OAuth2 > Scopes

**Required Scopes:**
- [ ] `bot` - Register as bot user

**Required Permissions:**
- [ ] **Manage Roles** (268435456 in decimal)
  - Required for `member.roles.add()` and `member.roles.set()`
  - Critical for all sanction operations
- [ ] **Send Messages** (2048)
  - Required for audit embeds in SANCTION_LOG_CHANNEL_ID
- [ ] **Embed Links** (16384)
  - Required for formatted embed messages
- [ ] **View Channels** (1024)
  - Required to read/list channels
- [ ] **Read Message History** (65536)
  - Optional, for message search

**Generate Invite URL:**
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&scope=bot&permissions=2154456064
```

Permission breakdown:
- `2048` = Send Messages
- `16384` = Embed Links
- `268435456` = Manage Roles
- `65536` = Read Message History
- Total: `2154456064`

### 4. Guild Configuration

**Bot must be in Los Esperados guild:**
- [ ] Invite bot using OAuth2 URL above
- [ ] Accept Discord prompt
- [ ] Verify bot appears in Members list

## Role Hierarchy (Critical!)

Discord enforces role hierarchy: **Bot can only manage roles below its own role.**

**Required Setup:**

1. **Create "Panel-Bot" role** (or use existing bot role)
   - [ ] Role exists in guild
   - [ ] Role is positioned in role list

2. **Position bot role above sanction roles:**
   ```
   @everyone (bottom)
   ...
   AVERT_ORAL_PLAYTIME (sanction)
   AVERT_ORAL_REUNION (sanction)
   AVERT_LEGER (sanction)
   AVERT_LOURD (sanction)
   DEMOTE (sanction)
   RESERVISTE (sanction)
   BLACKLIST (sanction)
   ...
   @Panel-Bot (must be above all sanction roles!)
   @Admin (optional, above bot)
   ```

3. **Verify hierarchy:**
   - [ ] Bot role is **not** below any sanction role
   - [ ] Error "Missing Permissions" means bot role too low

## Discord Channel Configuration

### SANCTION_LOG_CHANNEL_ID

**Location:** Your Discord guild > #sanction-log (or similar)

**Setup:**
- [ ] Channel exists in guild
- [ ] Channel ID: `1409028569203740792` (configured in .env.production)
- [ ] Bot can send messages there (test with `/test` command)
- [ ] Bot can create embeds (test manually post embed)

**Test:**
```bash
# Manually test bot can post:
curl -X POST https://discord.com/api/v10/channels/1409028569203740792/messages \
  -H "Authorization: Bot YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content": "Test message"}'
```

### DISCORD_LOGS_CHANNEL_ID & DISCORD_TICKETS_CHANNEL_ID

- [ ] Channel IDs configured (see .env.production)
- [ ] Bot can post to logs channel
- [ ] Bot can post to tickets channel

## Pre-Deployment Checklist

### Developer Portal
- [ ] Bot created in Developer Portal
- [ ] Bot token generated and set in `DISCORD_BOT_TOKEN`
- [ ] Privileged intents enabled: GUILD_MEMBERS
- [ ] Permissions configured: Manage Roles, Send Messages, Embed Links
- [ ] OAuth2 redirect URI includes `/api/auth/callback/discord`

### Guild Configuration
- [ ] Bot invited to Los Esperados guild
- [ ] Bot role positioned **above** all sanction roles in hierarchy
- [ ] Bot can access channels (permissions inherited from guild)
- [ ] SANCTION_LOG_CHANNEL_ID accessible by bot
- [ ] All sanction roles exist in guild

### Environment Variables
- [ ] `DISCORD_BOT_TOKEN` set (from Developer Portal)
- [ ] `DISCORD_GUILD_ID` = 1312845998753710151 (pre-filled)
- [ ] `SANCTION_LOG_CHANNEL_ID` = 1409028569203740792 (pre-filled)
- [ ] All role IDs are correct (copy from Discord)

## Testing Sanction Operations

After deployment, test sanction operations:

### 1. Create Sanction

```bash
POST /api/staff/sanctions
Authorization: Bearer SESSION_TOKEN
Content-Type: application/json

{
  "discordId": "USER_DISCORD_ID",
  "type": "AVERT_LEGER",
  "reason": "Test sanction",
  "createdBy": "YOUR_DISCORD_ID"
}
```

**Expected:**
- Response status: 200
- Sanction created in database
- Role added to member in Discord
- Embed posted to SANCTION_LOG_CHANNEL_ID

### 2. Verify Role Applied

- [ ] Check member in Discord
- [ ] Should have the sanction role (AVERT_LEGER, etc.)
- [ ] Check SANCTION_LOG_CHANNEL_ID
- [ ] Should see embed: "Sanction > APPLIED"

### 3. Test Expiration (if AVERT_LEGER)

- [ ] Wait for worker to run (60s polling)
- [ ] After 7 days (or immediately in test), check:
  - [ ] Role removed from member
  - [ ] clearedAt timestamp set in database
  - [ ] Embed sent to SANCTION_LOG_CHANNEL_ID: "Expired"

### 4. Test Manual Clear

```bash
POST /api/staff/sanctions/{sanctionId}/clear
Authorization: Bearer SESSION_TOKEN
```

**Expected:**
- Response status: 200
- clearedAt timestamp set
- Role removed (if not already)
- Embed posted to SANCTION_LOG_CHANNEL_ID: "Cleared"

## Troubleshooting

### Bot Can't Assign Roles

**Error:** `Code 50013: Missing Permissions`

**Causes:**
1. Bot role is positioned below sanction roles (most common)
2. Bot doesn't have "Manage Roles" permission
3. Bot not in guild

**Fix:**
1. In Discord settings, drag bot role **above** sanction roles
2. Verify permissions in Developer Portal
3. Re-invite bot to guild

### Missing Embed in Logs Channel

**Error:** Sanction created but no log embed

**Causes:**
1. SANCTION_LOG_CHANNEL_ID wrong or doesn't exist
2. Bot can't post in channel
3. Bot can't create embeds

**Fix:**
1. Verify SANCTION_LOG_CHANNEL_ID is correct (check guild)
2. Check bot role has "Send Messages" + "Embed Links"
3. Test manually: `POST /channels/{id}/messages`

### Intents Not Working

**Error:** Guild members can't be fetched

**Causes:**
1. GUILD_MEMBERS intent not enabled
2. Bot not authorized in guild

**Fix:**
1. Enable GUILD_MEMBERS in Developer Portal
2. Regenerate invite URL and re-invite bot

## Security Best Practices

1. ✅ Never commit `DISCORD_BOT_TOKEN` to git
2. ✅ Rotate token if exposed (regenerate in Developer Portal)
3. ✅ Limit bot permissions to minimum needed
4. ✅ Monitor SANCTION_LOG_CHANNEL_ID for failed operations
5. ✅ Keep role hierarchy organized (bot role above targets)
6. ✅ Log all role changes in audit trail
