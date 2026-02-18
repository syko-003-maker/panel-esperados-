#!/bin/bash

# Setup daily backup cron job
# Run once: ./scripts/setup-cron.sh

set -e

CRON_FILE="/etc/cron.d/panel-backup"
BACKUP_SCRIPT="$(pwd)/scripts/backup.sh"

echo "Setting up daily backup cron job..."

# Make backup script executable
chmod +x "$BACKUP_SCRIPT"
chmod +x "$(pwd)/scripts/restore.sh"

# Create cron job (runs at 3 AM every day)
sudo tee "$CRON_FILE" > /dev/null <<EOF
# Panel PostgreSQL Backup
# Runs daily at 3:00 AM
0 3 * * * root cd $(pwd) && bash scripts/backup.sh >> /var/log/panel-backup.log 2>&1
EOF

# Set correct permissions
sudo chmod 0644 "$CRON_FILE"

# Reload cron
sudo service cron reload

echo "Cron job installed successfully!"
echo "Backup will run daily at 3:00 AM"
echo "Logs: /var/log/panel-backup.log"
echo ""
echo "To test backup now, run:"
echo "  bash scripts/backup.sh"
