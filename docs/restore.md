# Database Restore Guide

This document explains how to restore a database backup and perform rollback in production.

## Prerequisites

- PostgreSQL `psql` and `pg_dump` tools installed
- Access to the database server
- Access to backup files in `DB_BACKUP_PATH`
- Environment variable `ALLOW_DB_RESTORE=true` (for API restore)

## Backup Location

Backups are stored in the path defined by `DB_BACKUP_PATH` environment variable.
Default: `./backups`

Backup filename format: `backup-YYYYMMDDHHMM.sql`

## Manual Restore (Recommended for Production)

### Step 1: Stop the Application

```bash
# Stop the panel
pm2 stop panel
# or
docker-compose down panel
```

### Step 2: Create a Pre-Restore Backup

Always create a backup of the current state before restoring:

```bash
pg_dump -h <host> -p <port> -U <user> -d <database> -F p -f pre-restore-$(date +%Y%m%d%H%M).sql
```

### Step 3: Restore the Backup

```bash
# Set password
export PGPASSWORD=<password>

# Restore
psql -h <host> -p <port> -U <user> -d <database> -f /path/to/backup-YYYYMMDDHHMM.sql
```

### Step 4: Run Prisma Migrations (if needed)

After restore, ensure the schema is up to date:

```bash
npx prisma migrate deploy
```

### Step 5: Restart the Application

```bash
pm2 start panel
# or
docker-compose up -d panel
```

### Step 6: Verify

- Check the application is running
- Verify data integrity
- Check logs for errors

## API Restore (Admin Only)

⚠️ **Use with caution** - Only available when `ALLOW_DB_RESTORE=true`

```bash
# First, set the environment variable
export ALLOW_DB_RESTORE=true

# Restart the panel to pick up the change

# Then call the API (when implemented)
curl -X POST https://panel.example.com/api/admin/db/restore \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"filename": "backup-202601201200.sql"}'
```

## Rollback Checklist

- [ ] Application stopped
- [ ] Pre-restore backup created
- [ ] Target backup file verified (size, date)
- [ ] Database restored
- [ ] Prisma migrations deployed
- [ ] Application restarted
- [ ] Application health verified
- [ ] Data integrity verified
- [ ] Logs checked for errors

## Troubleshooting

### "Restore not allowed" Error

Set `ALLOW_DB_RESTORE=true` in environment variables and restart the application.

### "Backup file not found" Error

1. Check the backup path: `DB_BACKUP_PATH`
2. Verify the file exists: `ls -la /path/to/backups/`
3. Check file permissions

### Connection Errors

1. Verify `DATABASE_URL` is correct
2. Check database is accessible from the application server
3. Verify credentials

### Schema Mismatch After Restore

Run Prisma migrations to update the schema:

```bash
npx prisma migrate deploy
```

## GDPR Considerations

When restoring from backup, be aware that:

1. **Anonymized data may be restored** - GDPR purges are not reversible, but restoring from a pre-purge backup will restore the data.

2. **Audit trail** - All restores should be logged and documented for compliance.

3. **Data subject notification** - If restoring data that was previously purged per GDPR request, you may need to re-process the purge.

## Retention Policy

Backups are automatically cleaned based on `DB_BACKUP_RETENTION_DAYS` (default: 30 days).

To run retention cleanup manually:

```bash
curl -X POST https://panel.example.com/api/admin/db/retention \
  -H "Authorization: Bearer <token>"
```

## Contact

For emergency restore assistance, contact the system administrator.
