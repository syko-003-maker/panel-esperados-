# Sanctions v2 — Role-Based System (Los Esperados)

## Overview

Sanctions v2 is a role-based sanction system that applies sanctions by adding or replacing Discord roles. Temporary warnings auto-expire after 7-14 days. Permanent sanctions (DEMOTE, RESERVISTE, BLACKLIST) persist indefinitely.

**No kicks, no bans, no timeouts** — pure role management.

---

## Sanction Types (7 Total)

### Temporary Warnings (Auto-Expiring)

| Type | Role ID | Duration | Behavior | Clear |
|------|---------|----------|----------|-------|
| **AVERT_ORAL_PLAYTIME** | `1343272798231199836` | 7 days | `add()` | Auto remove role |
| **AVERT_ORAL_REUNION** | `1343272736331665500` | 7 days | `add()` | Auto remove role |
| **AVERT_LEGER** | `1312845999340781640` | 7 days | `add()` | Auto remove role |
| **AVERT_LOURD** | `1312845999340781641` | 14 days | `add()` | Auto remove role |

**Auto-Clear Behavior:**
- Worker checks every 60 seconds for expired sanctions
- On expiration: removes role, sets `clearedAt`, creates audit log
- Discord notification sent to `SANCTION_LOG_CHANNEL_ID`
- Non-blocking: if notification fails, sanction still cleared

### Permanent Sanctions (No Expiration)

| Type | Roles Applied | Behavior | Notes |
|------|--------------|----------|-------|
| **RESERVISTE** | `LOS_ESPERADOS`, `RESERVISTE` | `set()` (replaces all) | Removes all other roles |
| **DEMOTE** | `CITIZEN`, `DEMOTE`, `ANCIEN_ESPERADOS` | `set()` (replaces all) | Removes all other roles |
| **BLACKLIST** | `BLACKLIST` | `set()` (replaces all) | Complete role removal except @everyone |

**Permanent Behavior:**
- No `expiresAt` field
- Manual clear via API only (see below)
- Audit logged when cleared manually

---

## Application Flow

### 1. Create Sanction

**Endpoint:** `POST /api/staff/sanctions`

**Request:**
```json
{
  "memberDiscordId": "123456789...",
  "type": "AVERT_LEGER",
  "reason": "Comportement inadéquat en réunion"
}
```

**Process:**
1. Validate member exists
2. Create sanction record with auto-calculated `expiresAt`
3. Create Discord outbox job (SANCTION_APPLY)
4. **[NEW]** Evaluate automatic rules if `ENABLE_AUTO_SANCTION_RULES=1`
5. Return created sanction

**Expires At Logic:**
- `AVERT_*` (PLAYTIME, REUNION, LEGER): `createdAt + 7 days`
- `AVERT_LOURD`: `createdAt + 14 days`
- DEMOTE, RESERVISTE, BLACKLIST: `null` (never expires)

### 2. Apply Sanction (Worker)

**Process:** `processSanctionApply()` in `apps/discord/worker.ts`

**For each sanction type:**

```
AVERT_ORAL_PLAYTIME → member.roles.add(ROLE_ID)
AVERT_ORAL_REUNION  → member.roles.add(ROLE_ID)
AVERT_LEGER         → member.roles.add(ROLE_ID)
AVERT_LOURD         → member.roles.add(ROLE_ID)

RESERVISTE          → member.roles.set([LOS_ESPERADOS, RESERVISTE])
DEMOTE              → member.roles.set([CITIZEN, DEMOTE, ANCIEN_ESPERADOS])
BLACKLIST           → member.roles.set([BLACKLIST])
```

**Outcome:**
- `discordStatus` = APPLIED or FAILED
- `discordAppliedAt` = timestamp
- Embed sent to `SANCTION_LOG_CHANNEL_ID`
- Audit log created

### 3. Auto-Expiration (Worker)

**Process:** `processExpiredSanctions()` in `apps/discord/worker.ts`

**Runs every 60 seconds:**

```
For each sanction where:
  - expiresAt <= now
  - clearedAt is NULL
  - status = ACTIVE

Actions:
  1. Fetch guild member
  2. Remove role (if AVERT_*)
  3. Set clearedAt = now
  4. Set clearedStatus = APPLIED
  5. Create audit log SANCTION_CLEARED
  6. Send Discord notification (non-blocking)
```

**Example Notification:**
```
Title: Sanction Levée
Colour: Green (0x57f287)
Content:
  Membre: @user
  Type: AVERT_LEGER
  Durée: 7j
  Résultat: CLEARED
```

---

## Manual Clear (Staff Action)

**Endpoint:** `POST /api/staff/sanctions/[id]/clear`

**Requirements:**
- Staff link required (`requireStaffLinked()`)
- Sanction type must be `AVERT_*`
- `clearedAt` must be `null`

**Process:**
1. Validate sanction (type, not already cleared)
2. Set `clearedAt = now`, `clearedStatus = APPLIED`
3. Create audit log: `SANCTION_CLEARED_MANUAL`
4. **[NEW]** Evaluate automatic rules if enabled
5. Return success

**UI Button:**
- Text: "Retirer maintenant" (Remove now)
- Visible only if: AVERT_* AND not yet cleared
- Requires confirmation dialog
- Shows loading state during operation

---

## Automatic Rules Engine

**Feature Flag:** `ENABLE_AUTO_SANCTION_RULES`

### Configuration

```env
# In .env.local:
ENABLE_AUTO_SANCTION_RULES=0  # Default: disabled (safe)
ENABLE_AUTO_SANCTION_RULES=1  # Enable auto rules
```

### Rules (When Enabled)

**Rule 1:** ≥3 AVERT_LEGER → Auto-create DEMOTE
```
If member has 3+ active AVERT_LEGER sanctions:
  → Create DEMOTE sanction automatically
  → createdBy = "SYSTEM"
  → Reason = "3x AVERT_LEGER accumulés"
```

**Rule 2:** ≥2 AVERT_LOURD → Auto-create DEMOTE
```
If member has 2+ active AVERT_LOURD sanctions:
  → Create DEMOTE sanction automatically
  → createdBy = "SYSTEM"
  → Reason = "2x AVERT_LOURD accumulés"
```

### Trigger Points

Rules are evaluated at:
1. **After sanction creation** (POST /api/staff/sanctions)
2. **After manual clear** (POST /api/staff/sanctions/[id]/clear)

### Audit Trail

```
Action: SANCTION_AUTO_APPLIED
Entity: Sanction
Meta: {
  memberId,
  type: "DEMOTE",
  reason: "3x AVERT_LEGER accumulés",
  trigger: "auto-rules"
}
```

### Disabling

**If `ENABLE_AUTO_SANCTION_RULES != "1"`:**
- Rules engine returns early (no-op)
- Manual sanctions only
- Safe default for testing/staging

---

## Data Model

### Sanction Record

```typescript
{
  id: string;
  memberId: string;
  discordId: string;
  type: SanctionType;  // 7 types above
  reason: string;
  status: "ACTIVE" | "EXPIRED" | "CLOSED";
  discordStatus: "PENDING" | "APPLIED" | "FAILED";
  discordError: string | null;
  
  // Timestamps
  startAt: DateTime;
  expiresAt: DateTime | null;  // null for permanent
  clearedAt: DateTime | null;
  
  // Clear tracking
  clearedStatus: "PENDING" | "APPLIED" | "FAILED" | null;
  clearedError: string | null;
  
  // Audit
  createdById: string;  // User ID or "SYSTEM"
  createdAt: DateTime;
  updatedAt: DateTime;
}
```

---

## Database Indexes

```sql
-- Efficient expiration checks
CREATE INDEX sanction_expires_at ON sanction(expiresAt);
```

---

## Error Handling

### Missing Environment Variables

If `SANCTION_LOG_CHANNEL_ID` is missing:
- Sanction creation fails with `SANCTION_LOG_CHANNEL_ID_MISSING`
- `discordStatus` = FAILED
- Audit log created: `SANCTION_FAILED`
- Response: 400 Bad Request

If Discord role IDs are invalid:
- Worker catches Discord API errors
- `discordStatus` = FAILED
- `discordError` = error message
- Audit log created: `SANCTION_FAILED`
- No throw — graceful degradation

### Network Failures

**Role removal (expiration):**
- If role.remove() fails: logged, sanction marked APPLIED anyway
- Non-blocking: process continues

**Notification send:**
- If embed.send() fails: logged, cleared sanction still marked APPLIED
- Non-blocking: notification is best-effort

---

## API Endpoints

### List Sanctions

```http
GET /api/staff/sanctions
  ?familyId=esperados
  &status=ACTIVE
  &type=AVERT_LEGER
  &page=1
  &pageSize=20
```

Response: Paginated list with all fields

### Get Sanction Detail

```http
GET /api/staff/sanctions/[id]
```

Response: Full sanction + audit logs

### Create Sanction

```http
POST /api/staff/sanctions
Content-Type: application/json

{
  "memberDiscordId": "...",
  "type": "AVERT_LEGER",
  "reason": "..."
}
```

### Retry Failed Apply

```http
POST /api/staff/sanctions/[id]/retry
```

### Clear Sanction (Manual)

```http
POST /api/staff/sanctions/[id]/clear
```

### Member Timeline

```http
GET /api/staff/members/[discordId]/sanctions
```

Response: Complete chronological timeline with audit events

---

## UI Components

### Staff Sanctions List

- Type selector (7 types)
- Filters: status, discordStatus, member
- Columns: member, type, reason, startAt, expiresAt, clearedAt, actions
- Pagination: >50 items

### Sanction Detail

- All metadata fields
- Retry button (if FAILED)
- Clear Now button (if AVERT_* AND not cleared)
- Audit event timeline

### Member Sanctions Timeline

- Chronological grouped by date
- Shows: type, reason, dates, createdBy, status
- Expandable audit events
- Non-staff view: only own sanctions

---

## Testing Checklist

- [ ] Create AVERT_LEGER → role added immediately
- [ ] Create AVERT_LOURD → 14d expiration calculated
- [ ] Create DEMOTE → all roles replaced
- [ ] Create BLACKLIST → all roles replaced
- [ ] Manual clear AVERT_* → role removed, clearedAt set
- [ ] Auto expiration at 7d → role removed, notification sent
- [ ] Auto rules: 3x AVERT_LEGER → DEMOTE created
- [ ] Auto rules disabled: rules don't trigger
- [ ] Missing SANCTION_LOG_CHANNEL_ID → FAILED with audit
- [ ] Discord API 50013 → FAILED, logged
- [ ] Member timeline → all events visible

---

## Deployment Notes

1. **Migrate database:** `npx prisma migrate deploy`
2. **Seed roles (if needed):** Verify role IDs exist in Discord
3. **Set environment variables:** See .env.example
4. **Enable auto rules gradually:** Start with `ENABLE_AUTO_SANCTION_RULES=0`, test manually first
5. **Monitor logs:** Watch for "SANCTION_FAILED" events in first 24h
6. **Backup Discord roles:** In case of accidental role removal

---

## Support & Monitoring

**Key Metrics:**
- Sanctions created/day
- Failed applications (discordStatus=FAILED)
- Auto-rule triggers (if enabled)
- Clear operations (manual + auto)

**Alert on:**
- `discordStatus = FAILED`
- Missing `SANCTION_LOG_CHANNEL_ID`
- Worker crash on role operations

**Debug:**
- Check Discord permissions: bot must have "Manage Roles" on all target roles
- Check role hierarchy: bot role must be above target roles
- Check guild membership: member must be in guild

---

## Version History

- **v2.0** (2026-01-31): Role-based system, auto-expiration, auto-rules, manual clear
