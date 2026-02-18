# GDPR Compliance Guide

This document explains how to handle GDPR requests in the panel.

## Overview

The panel supports two main GDPR rights:

1. **Right to Access** - Export all data for a member
2. **Right to Erasure (Right to be Forgotten)** - Anonymize all data for a member

## Configuration

### Environment Variables

```env
# Enable GDPR purge functionality
GDPR_PURGE_ENABLED=true

# Secret for hashing anonymized IDs (optional, has default)
GDPR_HASH_SECRET=your-secret-here
```

## Right to Access (Data Export)

### Via API

```bash
curl -X GET "https://panel.example.com/api/admin/gdpr/export?memberDiscordId=123456789" \
  -H "Authorization: Bearer <token>"
```

### Response

```json
{
  "ok": true,
  "memberDiscordId": "123456789",
  "exportedAt": "2026-01-20T10:00:00.000Z",
  "data": {
    "member": { ... },
    "recruitments": [ ... ],
    "complaints": [ ... ],
    "sanctions": [ ... ],
    "absences": [ ... ],
    "activitySnapshots": [ ... ]
  }
}
```

## Right to Erasure (GDPR Purge)

⚠️ **This action is IRREVERSIBLE**

### What Gets Anonymized

| Entity | Fields Anonymized |
|--------|-------------------|
| Member | discordId → `gdpr:<hash>`, steamId → null, rpName → "[GDPR Anonymized]" |
| Recruitments | discordId, rpName, authorTag, payload, motivation, screenshots |
| Complaints | authorDiscordId, authorRpName, authorTag, payload, evidence |
| Sanctions | discordId, reason (structure kept for compliance) |
| Absences | discordId, reason |
| Audit Logs | actorId, actorName (when actor is the member) |
| Activity Snapshots | memberDiscordId |
| Meeting Decisions | memberDiscordId |

### What Is Kept (For Compliance)

- Sanction records (anonymized) - Required for organizational compliance
- Audit log actions - Required for security audit trail
- Meeting decisions structure - Required for historical records

### Via API

**Step 1: Check Status**

```bash
curl -X GET "https://panel.example.com/api/admin/gdpr/purge" \
  -H "Authorization: Bearer <token>"
```

**Step 2: Initiate Purge (without confirm - preview)**

```bash
curl -X POST "https://panel.example.com/api/admin/gdpr/purge" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"memberDiscordId": "123456789"}'
```

**Step 3: Confirm Purge**

```bash
curl -X POST "https://panel.example.com/api/admin/gdpr/purge" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"memberDiscordId": "123456789", "confirm": true}'
```

### Response

```json
{
  "ok": true,
  "warning": "Data has been permanently anonymized. This cannot be undone.",
  "anonymizedDiscordId": "gdpr:a1b2c3d4e5f6g7h8",
  "summary": {
    "membersAnonymized": 1,
    "ticketsAnonymized": 2,
    "complaintsAnonymized": 0,
    "sanctionsAnonymized": 1,
    "auditLogsAnonymized": 5
  }
}
```

## Process for Handling GDPR Requests

### 1. Verify Identity

Before processing any GDPR request, verify the identity of the requester:

- Confirm Discord ID matches the account making the request
- Use Discord OAuth or other verification methods

### 2. Document the Request

Create an internal record of:
- Date of request
- Type of request (access/erasure)
- Method of identity verification
- Date of processing

### 3. Process Within Deadline

GDPR requires processing within **30 days** (extendable to 90 days for complex cases).

### 4. Confirm Completion

Send confirmation to the requester that their request has been processed.

## Audit Trail

All GDPR purges are logged in the `AuditLog` table with:

- Action: `GDPR_PURGE`
- Entity: `Member`
- EntityId: The anonymized Discord ID hash
- Meta: Summary of what was anonymized

## Important Notes

1. **Backups** - GDPR purges do not affect existing backups. If you restore from a pre-purge backup, you must re-run the purge.

2. **Irreversibility** - There is no undo. The original Discord ID is hashed and cannot be recovered.

3. **Third Parties** - If data was shared with third parties (e.g., Discord logs), you may need to request deletion from those parties separately.

4. **Legal Basis** - Some data (sanctions, audit logs) may be kept in anonymized form for legitimate business interests or legal compliance.

## Contact

For GDPR-related questions, contact the data protection officer or system administrator.
