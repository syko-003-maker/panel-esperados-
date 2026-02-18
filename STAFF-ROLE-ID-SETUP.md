# 🎯 STAFF_ROLE_ID SETUP GUIDE

## Overview

`STAFF_ROLE_ID` is a **Discord role ID** used to automatically @mention staff when:
- ✉️ New recruitment candidates apply
- 📋 New complaints are submitted

**It's optional** but highly recommended for alerting your moderation team to new submissions.

---

## 🚀 Quick Setup (Automated)

If you have a valid `DISCORD_BOT_TOKEN`, the script can find your Staff role automatically:

```powershell
.\scripts\setup-staff-role.ps1
```

**This script will:**
1. ✅ Connect to Discord API
2. ✅ Find roles containing "staff", "admin", or "modér"
3. ✅ Suggest the matching role
4. ✅ Automatically update `env\.env.production.local`
5. ✅ Create a backup `.bak` file

---

## 📖 Manual Setup (If Script Can't Connect)

### Step 1: Find Your Staff Role ID in Discord

#### Option A: GUI Method (Easiest)
1. Open **Discord** and go to your guild
2. Click **Settings** (⚙️ icon in guild name)
3. Go to **Roles** in left menu
4. Find your **Staff** role (or similar: Modérateur, Admin, etc.)
5. **Right-click the role**
6. Click **Copy Role ID**
   ```
   Role ID copied to clipboard!
   ```

#### Option B: Developer Mode (Alternative)
1. Open Discord **User Settings**
2. Go to **Advanced**
3. Enable **Developer Mode** (toggle on)
4. In your guild, right-click the Staff role
5. Click **Copy User ID** (or **Copy ID** if shown)
6. Paste the ID

---

### Step 2: Update Environment File

Open `env\.env.production.local` and find this line:

```env
STAFF_ROLE_ID=__FILL_ME__staff_role_id_instructions_below
```

Replace it with your actual role ID (example - use YOUR ID):

```env
STAFF_ROLE_ID=1290707699888373832
```

✅ **Save the file**

---

### Step 3: Verify Configuration

```powershell
# Check the env file was updated correctly
Select-String "STAFF_ROLE_ID" env\.env.production.local
```

Output should show:
```
STAFF_ROLE_ID=1290707699888373832
```

NOT:
```
STAFF_ROLE_ID=__FILL_ME__
```

---

### Step 4: Restart Services

```powershell
# Stop current tunnel
.\scripts\tunnel-stop.ps1

# Start with updated config
.\scripts\tunnel-start.ps1 -UseTryCloudflare
```

The auto-update feature will reload the env file and apply the new STAFF_ROLE_ID.

---

## 🔍 How It's Used

### Recruitment Submissions

When a user submits a recruitment application, the Discord bot posts:

```
@Staff Nouvelle candidature !

[Embed with application details]
```

### Complaint Submissions

When a user submits a complaint, the Discord bot posts:

```
@Staff Nouvelle plainte !

[Embed with complaint details]
```

**If STAFF_ROLE_ID is empty:** Messages will post without @mention  
**If STAFF_ROLE_ID is set:** Staff role will be @mentioned for instant notification

---

## 📋 Expected Staff Role Names

Common names your Staff role might have:

| Name | Likely? | Usage |
|------|---------|-------|
| **Staff** | ✅ Most Common | General staff @mentions |
| **Modérateur** | ✅ Common | FR: Moderator |
| **Admin** | ✅ Very Common | Server admin role |
| **Officiers** | ⚠️ Sometimes | Specific to LOS ESPERADOS |
| **Capitaines** | ⚠️ Sometimes | Specific to LOS ESPERADOS |

**Tip:** The role you choose should be the one you want notified for new submissions.

---

## 🆔 Example Role IDs (from your guild)

These are your existing roles - use them as reference:

```env
LOS_ESPERADOS_ROLE_ID=1290707699888373832
CITIZEN_ROLE_ID=1226485545055666206
ANCIEN_ESPERADOS_ROLE_ID=1312846000289833050
STAFF_ROLE_ID=??????  # ← This is what we're finding

# Sanction roles (for reference)
AVERT_ORAL_PLAYTIME_ROLE_ID=1343272798231199836
AVERT_ORAL_REUNION_ROLE_ID=1343272736331665500
AVERT_LEGER_ROLE_ID=1312845999340781640
AVERT_LOURD_ROLE_ID=1312845999340781641
DEMOTE_ROLE_ID=1340837563753304075
RESERVISTE_ROLE_ID=1312845999366209682
BLACKLIST_ROLE_ID=1338901141873758288
```

All role IDs follow the same 18-19 digit format.

---

## ⚠️ Important Notes

### 1. Role Must Exist in Guild

The role ID must be from your Discord guild (`1312845998753710151`).  
If you use a role ID from another server, it won't work.

### 2. Not a User ID

Don't confuse with user IDs (your own Discord ID).  
Role IDs and User IDs have the same format, but:
- **Role ID:** Right-click role → "Copy ID"
- **User ID:** Right-click person → "Copy User ID"

### 3. Optional but Recommended

- ✅ Set: Staff get @mentioned immediately
- ❌ Empty: Messages post without @mention, staff might miss submissions

### 4. Can Change Later

You can update STAFF_ROLE_ID anytime:

```powershell
# Edit the file
nano env\.env.production.local

# Or use the setup script again
.\scripts\setup-staff-role.ps1

# Restart tunnel
.\scripts\tunnel-stop.ps1
.\scripts\tunnel-start.ps1 -UseTryCloudflare
```

---

## 🆘 Troubleshooting

### "Role ID not found"

**Problem:** Script ran but didn't find any staff roles

**Solution:**
1. Check the role name in Discord (might not contain "staff/admin")
2. Use manual GUI method to copy ID directly
3. Verify Discord guild ID matches: `1312845998753710151`

### "DISCORD_BOT_TOKEN not valid"

**Problem:** Script can't connect to Discord API

**Solution:**
1. Verify `DISCORD_BOT_TOKEN` in env file is correct (from Discord Developer Portal)
2. Regenerate bot token if it's very old
3. Use manual method instead

### Messages not mentioning staff

**Problem:** New submissions post but staff aren't @mentioned

**Check:**
1. Is `STAFF_ROLE_ID` filled in (not `__FILL_ME__`)?
2. Did you restart the tunnel after updating?
3. Is the role ID correct? (Try the setup script)

**Test:**
```powershell
# Verify env was loaded
Select-String "STAFF_ROLE_ID" env\.env.production.local
# Should show actual ID, not __FILL_ME__
```

---

## 📝 Configuration Validation

The tunnel startup script automatically checks STAFF_ROLE_ID:

```
[WARN] Some variables still contain __FILL_ME__:
  STAFF_ROLE_ID=__FILL_ME__staff_role_id_instructions_below
```

This is a WARNING, not an ERROR - the tunnel will still start, but staff won't be @mentioned.

To remove the warning, fill in STAFF_ROLE_ID following this guide.

---

## 🔄 Complete Setup Flow

```mermaid
1. Run setup script
   ↓
2. Script finds Staff role? 
   ├─ YES → Auto-update env → Done ✅
   └─ NO → Manual copy/paste from Discord
   ↓
3. Update env\.env.production.local
   ↓
4. Restart tunnel
   ↓
5. Verify no __FILL_ME__ warning
   ↓
6. Test: Submit recruitment/complaint
   ↓
7. Staff should see @mention ✅
```

---

## ✨ Summary

| Task | Command |
|------|---------|
| **Auto-find role** | `.\scripts\setup-staff-role.ps1` |
| **Manual copy** | Right-click role in Discord → Copy ID |
| **Verify setup** | `Select-String "STAFF_ROLE_ID" env\.env.production.local` |
| **Restart services** | `.\scripts\tunnel-start.ps1 -UseTryCloudflare` |
| **Check logs** | Verify no `__FILL_ME__` warnings on startup |

---

## 🎯 Guild Reference

Your Discord Guild:
```
Name: Los Esperados
Guild ID: 1312845998753710151
Owner: (Your account)

Roles:
- Los Esperados (member)
- Citizen
- Ancien Esperados
- Staff ← THIS ONE (find its ID)
- (Sanction roles)
```

Need help? Check the bot logs:
```powershell
Receive-Job -Id 1 -Keep -ErrorAction SilentlyContinue
```

Good luck! 🚀
