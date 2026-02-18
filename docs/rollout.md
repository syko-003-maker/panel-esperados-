# Safe Rollout Guide

This document explains how to safely deploy new features using feature flags and progressive rollout.

## Overview

The panel uses a feature flag system that allows enabling/disabling features without redeployment. This enables:

- **Progressive rollout** - Enable features one at a time
- **Quick rollback** - Disable problematic features instantly
- **A/B testing** - Enable features for specific environments
- **Maintenance mode** - Disable all features temporarily

## Feature Flags

### Available Flags

| Flag | Default | Description |
|------|---------|-------------|
| `ENABLE_TICKETS` | true | Ticket/recruitment ingestion |
| `ENABLE_SANCTIONS` | true | Sanction creation |
| `ENABLE_MEETINGS` | true | Meeting finalization |
| `ENABLE_ACTIVITY` | true | Activity tracking |
| `ENABLE_DM_NOTIFICATIONS` | false | Discord DM notifications |
| `ENABLE_SYNCROLES` | true | Discord role sync |
| `ENABLE_BANK_ALERTS` | true | Bank debt alerts |
| `ENABLE_GDPR_PURGE` | false | GDPR data purge |
| `ENABLE_BACKUPS` | true | Automatic backups |
| `MAINTENANCE_MODE` | false | Disable all operations |

### Managing Flags

#### Via UI

1. Navigate to `/staff/config`
2. Find the feature flag
3. Click the ON/OFF button to toggle

#### Via API

```bash
# Get all configs
curl -X GET "https://panel.example.com/api/admin/config" \
  -H "Authorization: Bearer <token>"

# Enable a feature
curl -X POST "https://panel.example.com/api/admin/config" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"key": "ENABLE_DM_NOTIFICATIONS", "value": true}'

# Disable a feature
curl -X POST "https://panel.example.com/api/admin/config" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"key": "ENABLE_DM_NOTIFICATIONS", "value": false}'
```

## Rollout Procedure

### Before Deployment

1. **Review changes** - Understand what's being deployed
2. **Prepare rollback** - Know which flags to disable
3. **Check metrics** - Note current baseline
4. **Schedule** - Deploy during low-traffic periods

### Step 1: Deploy with Features Disabled

For major new features:

1. Deploy code with feature flag checks
2. Ensure new features are disabled by default
3. Verify deployment is healthy

### Step 2: Enable Incrementally

```bash
# Enable feature
curl -X POST "https://panel.example.com/api/admin/config" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"key": "ENABLE_NEW_FEATURE", "value": true}'
```

### Step 3: Monitor

Watch for:
- Error rates in Sentry
- Metrics in `/staff/metrics`
- User reports
- System logs

### Step 4: Rollback if Needed

If issues are detected:

```bash
# Disable problematic feature
curl -X POST "https://panel.example.com/api/admin/config" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"key": "ENABLE_NEW_FEATURE", "value": false}'
```

No redeployment needed!

## Maintenance Mode

For emergency situations or major updates:

### Enable Maintenance Mode

```bash
curl -X POST "https://panel.example.com/api/admin/config" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"key": "MAINTENANCE_MODE", "value": true}'
```

This will:
- Return 503 for all protected operations
- Allow read-only access to the UI
- Block all ingest operations
- Block all create/update operations

### Disable Maintenance Mode

```bash
curl -X POST "https://panel.example.com/api/admin/config" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"key": "MAINTENANCE_MODE", "value": false}'
```

## Configuration Values

Beyond feature flags, you can configure:

| Key | Default | Description |
|-----|---------|-------------|
| `rate.ingest.perMinute` | 100 | Ingest rate limit |
| `rate.api.perMinute` | 1000 | API rate limit |
| `timeout.discord.ms` | 30000 | Discord API timeout |
| `threshold.ingestKo.alert` | 10 | Ingest failures to trigger alert |
| `pagination.default` | 25 | Default page size |
| `pagination.max` | 100 | Max page size |

## Cache Behavior

- Config values are cached for 60 seconds
- Changes take effect within 60 seconds
- For immediate effect, clear cache via UI or API:

```bash
curl -X PUT "https://panel.example.com/api/admin/config" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"action": "clear-cache"}'
```

## Best Practices

1. **Start disabled** - New features should be off by default
2. **One at a time** - Enable features individually
3. **Monitor first** - Wait 15-30 minutes before enabling next feature
4. **Document** - Record what was enabled and when
5. **Communicate** - Inform team before major changes
6. **Test** - Verify feature works before enabling in production

## Rollback Checklist

- [ ] Identify problematic feature
- [ ] Disable feature flag via UI or API
- [ ] Verify feature is disabled (check logs)
- [ ] Monitor for issue resolution
- [ ] Document incident
- [ ] Investigate root cause

## Example: Rolling Out DM Notifications

1. **Deploy** code with `ENABLE_DM_NOTIFICATIONS` guard
2. **Verify** deployment is healthy
3. **Enable** flag:
   ```bash
   curl -X POST ... -d '{"key": "ENABLE_DM_NOTIFICATIONS", "value": true}'
   ```
4. **Monitor** for:
   - DM send failures (rate limits, blocked DMs)
   - User complaints
   - Error metrics
5. **Rollback** if needed:
   ```bash
   curl -X POST ... -d '{"key": "ENABLE_DM_NOTIFICATIONS", "value": false}'
   ```
6. **Stabilize** and investigate before re-enabling

## Contact

For rollout assistance, contact the system administrator.
