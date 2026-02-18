# ✅ FAMILY NAME FIX - COMPLETE

## Problem Identified

The banklogs sync was returning `total=0, items=[]` despite LYG having 7080 entries.

**Root Cause**: LYG API requires the **full family name** "Los Esperados" in URL paths, but the sync code was passing the **internal slug** "esperados".

## URL Structure

```typescript
// ❌ WRONG (was using slug)
/familles/esperados/banklogs

// ✅ CORRECT (now using full name)
/familles/Los%20Esperados/banklogs
```

## Files Modified

### 1. `src/lib/family.ts`
Added constant to separate internal slug from LYG canonical name:

```typescript
export const DEFAULT_FAMILY_ID = "esperados";      // Internal slug
export const DEFAULT_FAMILY_NAME = "Los Esperados"; // LYG canonical name
```

### 2. `app/api/staff/sync/banklogs/route.ts`
```typescript
// Before:
lygFetchBanklogs(familySlug, { ... })

// After:
lygFetchBanklogs(DEFAULT_FAMILY_NAME, { ... })
```

### 3. `app/api/staff/sync/all/route.ts`
Updated all three LYG endpoints:

```typescript
// Members
lygFetchMembers(DEFAULT_FAMILY_NAME, { ... })

// Infos
lygFetchJson(`/familles/${encodeURIComponent(DEFAULT_FAMILY_NAME)}/infos`, { ... })

// Banklogs
lygFetchBanklogs(DEFAULT_FAMILY_NAME, { ... })
```

## How It Works

1. **Internal Operations** (Database, Prisma)
   - Use `DEFAULT_FAMILY_ID` ("esperados") 
   - Use `resolveFamilyId()` to get cuid for queries

2. **External Operations** (LYG API)
   - Use `DEFAULT_FAMILY_NAME` ("Los Esperados")
   - LYG endpoints expect full family name in paths

## Testing

1. Click "Sync maintenant" on `/staff/banklogs`
2. Check Network tab - should see `/familles/Los%20Esperados/banklogs`
3. Verify response has `total > 0` (expected: ~7080)
4. Confirm UI displays banklogs data

## Expected Results

- ✅ Sync succeeds with ~7080 banklogs
- ✅ No more `familyId=esperados` in LYG API calls
- ✅ All URLs use canonical family name "Los Esperados"
- ✅ UI displays data with pagination

## Architecture

```
┌─────────────────┐
│  UI Components  │
│  - Members      │  → /api/members?familyId=esperados (Prisma query)
│  - Banklogs     │  → /api/banklogs?familyId=esperados (Prisma query)
└─────────────────┘
         ↓
┌─────────────────┐
│  Sync Endpoints │
│  - /sync/all    │  → lygFetchMembers(DEFAULT_FAMILY_NAME)
│  - /sync/banks  │  → lygFetchBanklogs(DEFAULT_FAMILY_NAME)
└─────────────────┘
         ↓
┌─────────────────┐
│   LYG Client    │
│  lyg-client.ts  │  → /familles/Los%20Esperados/{endpoint}
└─────────────────┘
         ↓
┌─────────────────┐
│  External LYG   │
│  api.lyg.fr     │  ← Requires full family name
└─────────────────┘
```

## Commit Message

```
fix(sync): use canonical family name for LYG API calls

LYG API endpoints require full family name "Los Esperados" in URLs,
not the internal slug "esperados". This was causing banklogs sync
to return 0 results.

Changes:
- Added DEFAULT_FAMILY_NAME constant
- Updated sync/banklogs to use family name
- Updated sync/all (members, infos, banklogs)
- Separated internal slug from external LYG identifier

Fixes: Banklogs showing 0 results despite 7080 entries in LYG
```
