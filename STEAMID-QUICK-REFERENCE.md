# SteamID64 Dual Support - Quick Reference

## Status: ✅ COMPLETE & BUILD PASSING

**Build:** Exit 0, 0 TypeScript errors, 150 routes  
**Syntax:** All duplicate code removed and fixed  
**Database:** Prisma migration applied successfully  

---

## What Was Done

Implemented optional dual-steamId support in member linking:

✅ **Database:** Added `steamId` fields to Member + LinkRequest models  
✅ **UI:** SteamID64 input in NonLinkedCta with validation  
✅ **API:** 3 endpoints (request, accept/override, staff edit)  
✅ **Discord:** SteamID64 field in link-request embed  
✅ **Validation:** Format (17 digits), uniqueness (per family)  
✅ **Documentation:** STEAMID-IMPLEMENTATION.md + this summary  

---

## The 3 API Endpoints

### 1. POST /api/contact/link-request
**Member** submits link request with optional steamId
```bash
curl -X POST https://panel.com/api/contact/link-request \
  -H "Content-Type: application/json" \
  -d '{"steamId": "76561198312345678"}'
```
Response: `{ ok: true, requestId: "...", steamIdProvided: true }`

### 2. PATCH /api/ingest/link-requests/[id]/accept
**Worker** accepts request, can override steamId
```bash
curl -X PATCH https://worker.com/... \
  -H "x-ingest-secret: ..." \
  -d '{"clickerId": "123", "clickerName": "Staff", "steamId": "76561198..."}'
```
Response: `{ ok: true, memberId: "...", steamId: "76561198..." }`

### 3. PATCH /api/staff/members/[memberId]/steamid
**Staff** edits member steamId later (requires Chef role)
```bash
curl -X PATCH https://panel.com/api/staff/members/mid123/steamid \
  -H "Authorization: Bearer ..." \
  -d '{"steamId": "76561198..."}'
```
Response: `{ ok: true, member: { steamId: "76561198...", ... } }`

---

## Validation Rules

| Rule | Details | Example |
|------|---------|---------|
| **Format** | 17 digits exactly | ✅ `76561198312345678` |
| **Pattern** | `/^[0-9]{17}$/` | ❌ `7656119831234567` (16) |
| **Uniqueness** | Per family (esperados) | ❌ Can't use same steamId twice |
| **Null-able** | Optional field | ✅ Can be empty/null |
| **Override** | Staff can change | ✅ During accept or later |

---

## Error Codes

| Code | What | Response |
|------|------|----------|
| 400 | Invalid format | `"Invalid SteamID64 format. Must be exactly 17 digits."` |
| 409 | Already used | `"SteamID64 already linked to another member (rpName)"` |
| 403 | Permission denied | `"Forbidden"` (staff edit only) |
| 404 | Not found | `"Member not found"` (staff edit only) |

---

## Member Linking Workflow

### Scenario A: Member Provides SteamID
```
Member fills form with steamId
  ↓
POST /api/contact/link-request { steamId }
  ↓
LinkRequest created + Discord embed shown
  ↓
Staff accepts via worker
  ↓
PATCH /api/ingest/link-requests/[id]/accept
  ↓
Member created with steamId ✅
```

### Scenario B: Staff Overrides
```
LinkRequest received with wrong steamId
  ↓
Staff accepts but sends override steamId
  ↓
PATCH /api/ingest/link-requests/[id]/accept { steamId: "correct..." }
  ↓
Member created with override steamId ✅
```

### Scenario C: Edit Later
```
Member already linked, wants to change steamId
  ↓
Staff uses staff edit endpoint
  ↓
PATCH /api/staff/members/[memberId]/steamid { steamId: "new..." }
  ↓
Member.steamId updated ✅
```

---

## Database Fields

### Member Model
```prisma
steamId            String?  // SteamID64 (optional)
@@unique([familyId, steamId])  // Unique per family
@@index([steamId])  // Indexed for queries
```

### LinkRequest Model
```prisma
steamId     String?  // SteamID64 from member or staff override
@@index([steamId])  // Indexed
```

---

## File Locations

| What | Where |
|------|-------|
| Docs | [STEAMID-IMPLEMENTATION.md](STEAMID-IMPLEMENTATION.md) |
| Phase Summary | [STEAMID-PHASE-COMPLETION.md](STEAMID-PHASE-COMPLETION.md) |
| Member Request | [app/api/contact/link-request/route.ts](app/api/contact/link-request/route.ts) |
| Accept Endpoint | [app/api/ingest/link-requests/[id]/accept/route.ts](app/api/ingest/link-requests/[id]/accept/route.ts) |
| Staff Edit | [app/api/staff/members/[memberId]/steamid/route.ts](app/api/staff/members/[memberId]/steamid/route.ts) |
| UI Component | [app/(member)/dashboard/non-linked-cta.tsx](app/(member)/dashboard/non-linked-cta.tsx) |
| Schema | [prisma/schema.prisma](prisma/schema.prisma) |

---

## Testing Checklist

Quick tests to verify steamId flow:

- [ ] Member fills form with valid steamId (17 digits) → POST succeeds
- [ ] Member fills with invalid steamId (16 digits) → 400 error
- [ ] Member submits without steamId → POST succeeds (optional)
- [ ] Staff accepts with override steamId → Member gets override
- [ ] Staff tries duplicate steamId → 409 conflict error
- [ ] Staff edits via PATCH endpoint → Member updated
- [ ] Discord embed shows SteamID64 when provided
- [ ] Try to set same steamId twice in same family → conflict

---

## Deployment Checklist

Before going to production:

- [ ] `npm run build` passes (0 errors, 150 routes)
- [ ] `npx prisma migrate deploy` applied (4 migrations)
- [ ] Database backup taken
- [ ] Test endpoints in staging
- [ ] Review error messages with team
- [ ] Monitor logs after deploy
- [ ] Verify Discord embed displays correctly

---

## Build Verification

Latest build status:
```
✓ Compiled successfully in 5.8s
✓ Finished TypeScript in 8.9s  
✓ Collecting page data (150/150)
✓ Exit code: 0
✓ TypeScript errors: 0
```

Route count includes new endpoint:
- ✅ `/api/staff/members/[memberId]/steamid` (PATCH)
- ✅ All 150 routes registered

---

## SteamID64 Format Reference

17-digit identifier for Steam accounts:
- **Format:** `765611983XXXXXXXXXX`
- **Length:** Exactly 17 digits
- **Prefix:** `765611983` (fixed part)
- **Example:** `76561198312345678`

**Quick validation:** Count the digits - if it's not exactly 17, it's invalid.

---

## Logging

All steamId changes are logged:
```
[link-request] Created LinkRequest with steamId="76561198..."
[link-request:accept] Updated existing member, steamId="76561198..."
[staff:member:steamid] Updated, oldSteamId="...", newSteamId="..."
```

Check logs to verify steamId operations.

---

## Key Features

✅ Optional field - member can skip  
✅ Validation - 17 digits only  
✅ Uniqueness - per-family constraint  
✅ Override - staff can change during accept  
✅ Edit - staff can change later  
✅ Permission - only Chef role for edits  
✅ Discord - shows in link-request embed  
✅ Error handling - clear messages  
✅ Audit log - all changes tracked  
✅ Backward compatible - no breaking changes  

---

## Need More Details?

- **Full technical docs:** See [STEAMID-IMPLEMENTATION.md](STEAMID-IMPLEMENTATION.md)
- **Phase summary:** See [STEAMID-PHASE-COMPLETION.md](STEAMID-PHASE-COMPLETION.md)
- **Source code:** Check files listed above
- **API examples:** Look at response objects in docs
- **Error handling:** See error codes section above

---

**Last Updated:** 2025-02-01  
**Status:** ✅ Implementation Complete, Build Passing
