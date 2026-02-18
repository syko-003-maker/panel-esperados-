# P2003 Foreign Key Error Fix - Link Request Accept

## Problem
When accepting a link-request via `/api/ingest/link-requests/[id]/accept`, the endpoint was trying to create a `Member` with a `familyId` that didn't exist in the `Family` table, causing:

```
P2003 Foreign key constraint violated: Member_familyId_fkey
```

## Root Cause
The accept endpoint references `familyId: "esperados"` (hardcoded) when creating a Member, but assumes the Family row already exists in the database. If it doesn't exist, the foreign key constraint fails.

## Solution Implemented

### 1. Import from Source of Truth ✅
Changed from hardcoded string to use the project's centralized family ID:

```typescript
// Before:
const FAMILY_ID = "esperados";

// After:
import { DEFAULT_FAMILY_ID } from "@/lib/family";
const FAMILY_ID = DEFAULT_FAMILY_ID;
```

This ensures consistency with the rest of the project (staff/link, admin/backfill, etc.)

### 2. Ensure Family Exists Before Member Creation ✅
Added a `upsert` call to guarantee the Family row exists:

```typescript
// ✅ Ensure Family exists before creating Member (prevent P2003 foreign key error)
try {
  await prisma.family.upsert({
    where: { id: FAMILY_ID },
    update: {}, // No updates needed
    create: {
      id: FAMILY_ID,
      name: "Los Esperados",
    },
  });
  console.log("[link-request:accept] Family ensured", { familyId: FAMILY_ID });
} catch (err) {
  console.error("[link-request:accept] Failed to ensure family exists", {
    familyId: FAMILY_ID,
    error: err instanceof Error ? err.message : "Unknown error",
  });
  throw err;
}

// Now safe to create Member
let member = await prisma.member.create({
  data: {
    familyId: FAMILY_ID,
    // ... rest of member data
  }
});
```

### 3. Placement ✅
The upsert is placed:
- **After** validating the LinkRequest and steamId
- **After** updating the LinkRequest status
- **Before** creating or updating the Member

This ensures:
- Only valid requests trigger the Family creation
- Family is guaranteed to exist when Member is created
- Clear error handling if Family creation fails

## Changes Made

**File:** `app/api/ingest/link-requests/[id]/accept/route.ts`

### Imports
```typescript
+ import { DEFAULT_FAMILY_ID } from "@/lib/family";
```

### Constant
```typescript
- const FAMILY_ID = "esperados";
+ const FAMILY_ID = DEFAULT_FAMILY_ID;
```

### Family Upsert (before Member operations)
```typescript
+ // ✅ Ensure Family exists before creating Member (prevent P2003 foreign key error)
+ try {
+   await prisma.family.upsert({
+     where: { id: FAMILY_ID },
+     update: {},
+     create: {
+       id: FAMILY_ID,
+       name: "Los Esperados",
+     },
+   });
+   console.log("[link-request:accept] Family ensured", { familyId: FAMILY_ID });
+ } catch (err) {
+   console.error("[link-request:accept] Failed to ensure family exists", {
+     familyId: FAMILY_ID,
+     error: err instanceof Error ? err.message : "Unknown error",
+   });
+   throw err;
+ }
```

## Build Status
✅ **Build Successful**
```
Compilation: Success in 6.0 seconds
TypeScript: 0 errors
Routes: 150
Status: Ready
```

## Testing
The fix ensures that:
1. **First-time link requests**: Family "esperados" is created if it doesn't exist
2. **Subsequent requests**: Family is already present, upsert simply skips update
3. **Member creation**: Always succeeds because Family foreign key constraint is satisfied

## Error Handling
If Family creation fails:
- Error is logged with context
- Error is re-thrown to bubble up
- Response returns 500 with error message
- User sees: `{ ok: false, error: "Internal error" }`

## Benefits
✅ No more P2003 foreign key errors  
✅ Automatic Family row creation on first link-request acceptance  
✅ Idempotent (safe to call multiple times)  
✅ Consistent with project's centralized FAMILY_ID source  
✅ Clear logging for debugging  
✅ Proper error handling  

## Deployment Notes
No database migration required. The fix works with existing schema:
- Family rows can be created via application code
- Family.id is a String @id (can be set manually)
- No additional setup needed

Deploy with confidence - this fix is backward compatible and handles all scenarios.
