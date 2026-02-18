#!/bin/bash

# Restore PostgreSQL database from backup
# Usage: ./restore.sh backup_20240115_120000.sql.gz

set -e

# Configuration
BACKUP_DIR="/backups"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-postgres}"

# Check if backup file was provided
if [ -z "$1" ]; then
    echo "Usage: $0 <backup_file.sql.gz>"
    echo ""
    echo "Available backups:"
    ls -lh "$BACKUP_DIR"/backup_*.sql.gz 2>/dev/null || echo "No backups found"
    exit 1
fi

BACKUP_FILE="$BACKUP_DIR/$1"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo "ERROR: Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "[$(date)] WARNING: This will OVERWRITE the current database!"
echo "[$(date)] Database: $POSTGRES_DB"
echo "[$(date)] Backup file: $BACKUP_FILE"
echo ""
read -p "Are you sure? (yes/no): " -r
echo ""

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "Restore cancelled"
    exit 0
fi

echo "[$(date)] Starting restore..."

# Stop web and worker services
echo "[$(date)] Stopping services..."
docker compose stop web worker

# Drop existing connections and restore
echo "[$(date)] Restoring database..."
gunzip < "$BACKUP_FILE" | docker exec -i panel_db psql -U "$POSTGRES_USER" "$POSTGRES_DB"

# Restart services
echo "[$(date)] Restarting services..."
docker compose start web worker

echo "[$(date)] Restore completed successfully!"
