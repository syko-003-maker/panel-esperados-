# NextAuth Production Configuration Check

## Overview

This checklist ensures NextAuth is properly configured for production authentication.

## Critical Variables

### NEXTAUTH_SECRET

**What it is:** Encryption key for session tokens and callbacks

**Requirements:**
- ✅ Minimum 32 characters (recommend 64+)
- ✅ Cryptographically random (not a password or predictable string)
- ✅ Unique per environment (different for staging, production)
- ✅ Never changed after initial deployment (breaks all existing sessions)

**Generation:**

```bash
# Linux/Mac:
openssl rand -base64 32

# PowerShell:
$bytes = New-Object System.Byte[] 32
[System.Security.Cryptography.RNGCryptoServiceProvider]::new().GetBytes($bytes)
[System.Convert]::ToBase64String($bytes)
```

### NEXTAUTH_URL

**What it is:** Base URL where your application is deployed

**Format:** `https://yourdomain.com` (no trailing slash)

**Examples:**
- ✅ `https://panel.esperados.com`
- ✅ `https://staging-panel.esperados.com`
- ❌ `http://localhost:3000` (not for production)
- ❌ `https://panel.esperados.com/` (no trailing slash)

**Used for:** NextAuth callback URLs must include this as base

## Discord OAuth Configuration

### Discord Developer Portal Setup

1. Go to https://discord.com/developers/applications
2. Select your application (or create one)
3. Go to "OAuth2" → "General"

**Client ID:**
- From "CLIENT ID" field
- Can be public (visible in client-side code)
- Set as `DISCORD_CLIENT_ID`

**Client Secret:**
- From "CLIENT SECRET" field
- ⚠️ NEVER expose to client (server-only)
- Set as `DISCORD_CLIENT_SECRET`
- Regenerate if accidentally exposed

**Redirect URIs:**
- Must match your NextAuth callback routes
- Required: `https://yourdomain.com/api/auth/callback/discord`
- Add both production and staging URLs if needed

### Expected Redirect URI

If `NEXTAUTH_URL=https://panel.esperados.com`, then Discord expects:
```
https://panel.esperados.com/api/auth/callback/discord
```

This is configured in `app/api/auth/[...nextauth]/route.ts`

## Pre-Deployment Checklist

- [ ] **NEXTAUTH_SECRET**: 32+ characters, cryptographically random, different per env
- [ ] **NEXTAUTH_URL**: Matches your production domain, https://, no trailing slash
- [ ] **DISCORD_CLIENT_ID**: Copied from Developer Portal, environment variable set
- [ ] **DISCORD_CLIENT_SECRET**: Copied from Developer Portal, NOT in git
- [ ] **Redirect URI**: `https://yourdomain.com/api/auth/callback/discord` added to Discord app
- [ ] **DNS**: yourdomain.com resolves to your server
- [ ] **SSL/TLS**: Valid HTTPS certificate (not self-signed for production)
- [ ] **CORS**: No origin mismatches between app and Discord OAuth callback

## Testing Authentication

After deployment, test the login flow:

1. **Visit login page:**
   ```
   https://panel.esperados.com/
   ```

2. **Click "Login with Discord":**
   - Should redirect to Discord login
   - Should ask for permissions
   - Should redirect back to `https://panel.esperados.com/api/auth/callback/discord`

3. **Verify session cookie:**
   - Check browser DevTools > Application > Cookies
   - Should see `__Secure-next-auth.session-token` (secure, httponly)
   - Value should be encrypted

4. **Verify auth state:**
   - Should be logged in
   - `/me` route should show user info
   - Session should persist across page refreshes

## Troubleshooting

### "Invalid state parameter"
- Likely: NEXTAUTH_URL mismatch or redirect URI not registered
- Fix: Verify NEXTAUTH_URL matches domain, add redirect URI to Discord app

### "Discord OAuth error"
- Likely: Client ID/Secret wrong or Discord app not authorized
- Fix: Copy fresh credentials from Developer Portal

### Session not persisting
- Likely: NEXTAUTH_SECRET changed between deployments
- Fix: Keep same NEXTAUTH_SECRET value

### HTTPS required
- NextAuth requires HTTPS in production
- Development can use HTTP (localhost)
- Staging/Production MUST use HTTPS

## Security Best Practices

1. ✅ Never commit `.env.production` to git
2. ✅ Rotate DISCORD_CLIENT_SECRET if exposed
3. ✅ Use secure, random NEXTAUTH_SECRET
4. ✅ Enable HTTPS everywhere
5. ✅ Keep NEXTAUTH_SECRET consistent (don't change after deploy)
6. ✅ Monitor session logs for unauthorized access
