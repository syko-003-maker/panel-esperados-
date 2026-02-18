#!/bin/bash

# Backup PostgreSQL database
# Usage: ./backup.sh

set -e

# Configuration
BACKUP_DIR="/backups"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-postgres}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-7}"

# Create backup directory if not exists
mkdir -p "$BACKUP_DIR"

# Generate filename with timestamp
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="$BACKUP_DIR/backup_${TIMESTAMP}.sql.gz"

echo "[$(date)] Starting backup to $BACKUP_FILE"

# Execute pg_dump inside db container
docker exec panel_db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$BACKUP_FILE"

# Check if backup was successful
if [ -f "$BACKUP_FILE" ]; then
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo "[$(date)] Backup completed successfully: $BACKUP_FILE ($SIZE)"
else
    echo "[$(date)] ERROR: Backup failed!"
    exit 1
fi

# Delete old backups (keep last N days)
echo "[$(date)] Cleaning old backups (keeping last $RETENTION_DAYS days)"
find "$BACKUP_DIR" -name "backup_*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete

# List remaining backups
echo "[$(date)] Current backups:"
ls -lh "$BACKUP_DIR"/backup_*.sql.gz 2>/dev/null || echo "No backups found"

echo "[$(date)] Backup process completed"
