# STAFF_ROLE_ID — QUICK REFERENCE

## What is it?
Discord role ID → used to @mention staff on new submissions (optional)

## Where is it?
`env\.env.production.local` line 67

## Current Value?
```powershell
Select-String "STAFF_ROLE_ID" env\.env.production.local
```

## How to find it?

### Option 1: AUTO (Recommended)
```powershell
.\scripts\setup-staff-role.ps1
```
- Finds Staff role automatically ✅
- Updates env file ✅
- Creates backup ✅
- 2-3 minutes total

### Option 2: MANUAL (GUI)
1. Discord → Guild Settings
2. Click "Roles"
3. Right-click "Staff" role
4. Click "Copy Role ID"
5. Edit `env\.env.production.local`:
   ```env
   STAFF_ROLE_ID=1234567890123456789
   ```
6. Save & restart tunnel

### Option 3: MANUAL (Developer Mode)
1. Discord Settings → Advanced → Enable Developer Mode
2. Right-click Staff role → Copy ID
3. Paste in env file

## After Setting It Up

```powershell
# Verify it was set
Select-String "STAFF_ROLE_ID" env\.env.production.local

# Should show: STAFF_ROLE_ID=1234567890123456789
# NOT: __FILL_ME__

# Restart tunnel
.\scripts\tunnel-stop.ps1
.\scripts\tunnel-start.ps1 -UseTryCloudflare
```

## What Should It Look Like?

```env
# STAFF_ROLE_ID: Role to @mention when new recruitment/complaints arrive
# Optional: Can be empty (but staff won't be notified)
# How to find: Right-click "Staff" role in Discord > Copy ID
# Guild ID (for verification): 1312845998753710151
STAFF_ROLE_ID=1290707699888373832
```

❌ NOT:
```env
STAFF_ROLE_ID=__FILL_ME__staff_role_id
```

## Format
- Should be: 18-19 digit number
- Example: `1290707699888373832`
- NOT a user ID, NOT text

## What Happens With It?

New submissions get posted as:
```
@Staff Nouvelle candidature !
```

Staff get instant notification ✅

## What if I Don't Set It?

App still works fine, but:
```
Nouvelle candidature !
```

Staff won't see @mention ⚠️

## Still Confused?

Read: [STAFF-ROLE-ID-SETUP.md](STAFF-ROLE-ID-SETUP.md)

## Common Problems

| Problem | Solution |
|---------|----------|
| Script can't connect | Use manual method instead |
| Can't find role | Role might have different name (Admin, Modérateur, Officiers) |
| Role ID wrong | Double-check you copied from Discord correctly |
| Still not working | Verify it's a role ID, not user ID |

## Your Guild Info

```
Guild ID: 1312845998753710151
Bot Token: (from Discord Developer Portal)
Staff Role: (find and copy ID from Discord)
```

---

**TL;DR:** Run `.\scripts\setup-staff-role.ps1` and let the script find it. If that fails, copy role ID from Discord and paste in env file. Restart tunnel. Done! ✅
