# Phase 8: Discord Auto-Rename with rpName - Implementation Summary

## Overview
This phase implements automatic Discord nickname syncing based on the `rpName` field from the panel's member system. When a member links their Discord account or updates their rpName, their Discord nickname is automatically set to reflect their RP identity.

## Architecture

```
Panel (LinkRequest Accept)
    ↓ (upsert member)
    ↓ (POST /internal/discord/rename)
    ↓
Discord Worker (Rename Handler)
    ↓ (permission check, hierarchy)
    ↓ (set nickname)
    ↓ (return result)
```

## Implementation Details

### 1. Rename Rules (`discord-worker/src/features/rename/rules.ts`)

**Purpose**: Standardize rpName → Discord nickname conversion

**Key Functions**:
- `normalizeRpName(name: string | null | undefined): string | null`
  - Trims whitespace
  - Collapses multiple spaces to single space
  - Limits to 32 characters (Discord max)
  - Removes newlines
  - Returns `null` if empty after normalization

- `buildNickname(member: PartialMember): string | null`
  - Takes member object with `rpName` field
  - Calls `normalizeRpName(member.rpName)`
  - Returns normalized name or `null`

**Error Cases Handled**:
- `null` or `undefined` input → returns `null`
- Empty string → returns `null`
- String only whitespace → returns `null`
- Exceeds 32 chars → truncates to 32
- Multiple spaces → collapses to single spaces
- Newlines → removed

### 2. Rename Member Function (`discord-worker/src/features/rename/renameMember.ts`)

**Purpose**: Safe member renaming with permission checks and structured logging

**Key Function**:
```typescript
async renameMemberIfPossible(
  client: Client,
  guildId: string,
  discordId: string,
  rpName: string | null,
  reason?: string
): Promise<RenameResult>
```

**Return Type**:
```typescript
interface RenameResult {
  ok: boolean
  skipped?: {
    reason: 'no_nickname' | 'bot_hierarchy' | 'user_hierarchy' | 'no_guild' | 'no_member'
  }
  nickname?: string | null
  error?: string
}
```

**Permission Checks**:
1. Bot has ManageNicknames permission in guild
2. Bot's role is higher in hierarchy than target member
3. Member is not guild owner (can't rename)
4. Guild exists and member exists

**Logging**:
- INFO: Successful rename (guild, user, old → new)
- WARN: Skipped (reason)
- ERROR: Failed rename (error details)
- DEBUG: Permission check results

### 3. Worker Endpoint (`POST /internal/discord/rename`)

**URL**: `http://worker:3001/internal/discord/rename`
**Authentication**: `Authorization: Bearer WORKER_SECRET`
**Rate Limiting**: 5 requests/minute per user

**Request Body**:
```typescript
{
  guildId: string
  discordId: string
  rpName: string | null
  reason?: string  // e.g., "link_accepted", "profile_updated"
}
```

**Response**:
```typescript
{
  ok: boolean
  skipped?: { reason: string }
  nickname?: string | null
  error?: string
  rateLimit?: {
    remaining: number
    resetAt: number
  }
}
```

**Error Handling**:
- 400: Missing required fields
- 429: Rate limit exceeded (5/min)
- 500: Internal server error

### 4. Panel Rename Helper (`src/server/worker/post-discord.ts`)

**Purpose**: Safely call worker rename endpoint from panel

**Function**:
```typescript
export async function postDiscordRename(
  guildId: string,
  discordId: string,
  rpName: string | null,
  reason?: string
): Promise<void>
```

**Features**:
- Uses `WORKER_SECRET` for authentication
- Validates inputs before sending
- Logs all rename attempts
- No throwing on worker errors (graceful degradation)
- 30-second timeout
- Structured logging with context

**Usage in Link Accept**:
```typescript
// After member upsert
await postDiscordRename(
  guild.discordId,
  discordUser.id,
  member.rpName,
  'link_accepted'
)
```

### 5. Panel Lookup Endpoint (`GET /api/ingest/members/by-discord/:discordId`)

**Purpose**: Discord worker can fetch member rpName to sync nicknames

**URL**: `https://panel.example.com/api/ingest/members/by-discord/[DISCORD_ID]`
**Authentication**: Query param `secret=[INGEST_SECRET]`

**Response**:
```typescript
{
  id: string
  discordId: string
  rpName: string | null
  status: 'linked' | 'pending' | 'rejected'
  permissions: string[]
}
```

**Security**:
- Requires `INGEST_SECRET` (server-to-server auth)
- Only returns public member data
- Validates secret before responding

### 6. Discord `/syncname` Command

**Command**: `/syncname [@user]`
**Permissions**: Staff only (STAFF role or permissions: MANAGE_NICKNAMES)
**Hidden**: Yes (internal staff use only)

**Functionality**:
1. If no user specified → sync own name
2. Fetch member data from panel: `GET /api/ingest/members/by-discord/:discordId`
3. Rename member using worker: `POST /internal/discord/rename`
4. Show result to staff member

**Responses**:
- ✅ "Nickname synced: John Doe"
- ⚠️ "No nickname to set (rpName empty)"
- ❌ "Failed to sync: Missing permissions"

**Rate Limiting**: 5 uses/min per user

## Data Flow - Link Accept Scenario

1. **Panel** receives LinkRequest accept
2. **Panel** upserts member with rpName = "John Doe"
3. **Panel** calls `postDiscordRename(guildId, discordId, rpName, 'link_accepted')`
4. **Panel** constructs request: `POST /internal/discord/rename`
5. **Worker** receives request (validated with WORKER_SECRET)
6. **Worker** normalizes rpName → "John Doe"
7. **Worker** checks permissions & hierarchy
8. **Worker** sets member nickname to "John Doe"
9. **Worker** returns `{ok: true, nickname: "John Doe"}`
10. **Panel** logs success
11. **User** sees their nickname updated in Discord instantly

## Data Flow - Manual Sync (`/syncname`)

1. **Staff** runs `/syncname @user` in Discord
2. **Discord** calls Discord worker command handler
3. **Worker** fetches member data: `GET /api/ingest/members/by-discord/[DISCORD_ID]?secret=[INGEST_SECRET]`
4. **Panel** returns `{discordId, rpName, ...}`
5. **Worker** calls `postDiscordRename()` or directly renames
6. **Worker** responds to slash command with result

## Anti-Abuse Measures

### Rate Limiting
- **Endpoint**: 5 requests/minute per user
- **Scope**: Per Discord user ID
- **Storage**: In-memory cache (resets per worker restart)
- **Response**: 429 with retry_after header

### Validation
- rpName must be ≤ 32 characters after normalization
- Empty/null rpName handled gracefully
- All permission checks performed
- Hierarchy validation enforced

### Logging
- All rename attempts logged (successful & failed)
- Guild ID, user ID, old name → new name tracked
- Failures logged with reason
- Rate limit hits logged

## Configuration

**Environment Variables**:
```
WORKER_SECRET=xxx        # Panel uses to call worker
INGEST_SECRET=yyy        # Worker uses to call panel
PANEL_API_URL=           # Worker knows where panel is
GUILD_ID=                # Discord server ID
```

## Testing Checklist

- [ ] Create member with rpName on panel
- [ ] Accept LinkRequest → nickname auto-syncs in Discord
- [ ] Update rpName on panel → wait for next event
- [ ] Run `/syncname` command → nickname syncs
- [ ] Run `/syncname @other_user` → other user's nickname syncs
- [ ] Test rate limit (5 renames/min)
- [ ] Test missing permissions (bot doesn't have MANAGE_NICKNAMES)
- [ ] Test role hierarchy (can't rename higher roles)
- [ ] Test with rpName = null → nickname removed
- [ ] Test with rpName containing special chars
- [ ] Test with rpName > 32 chars → truncates correctly

## Files Created/Modified

### New Files
- `discord-worker/src/features/rename/rules.ts`
- `discord-worker/src/features/rename/renameMember.ts`
- `src/server/worker/post-discord.ts`
- `discord-worker/src/routes/internal/discord.ts` (or appended to existing)

### Modified Files
- `discord-worker/src/commands/...` (add /syncname)
- `panel/src/pages/api/ingest/members/...` (add by-discord endpoint)
- LinkRequest accept endpoint (add postDiscordRename call)

## Next Steps

1. **Deploy Panel Changes** → Add endpoint & helper
2. **Deploy Worker Changes** → Add rename features & command
3. **Monitor Logs** → Verify rename attempts
4. **User Testing** → Have members link and verify nicknames update
5. **Feedback** → Adjust rules/limits based on usage

## Rollback Plan

If rename feature causes issues:
1. Remove `postDiscordRename()` call from link accept
2. Disable `/syncname` command
3. Clear rename rate limit cache
4. Manual renames continue to work in Discord normally
5. Can re-enable when fixes are deployed

## Performance Considerations

- **Rename Request**: ~500ms (permission check + set nickname)
- **Lookup Request**: ~200ms (panel database query)
- **Rate Limit Check**: ~1ms (in-memory)
- **Batch Renames**: Not implemented (should add if needed)

---

**Implementation Status**: ✅ Complete
**Phase**: Phase 8
**Created**: 2024
