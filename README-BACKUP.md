# 🗄️ Backup & Restore Guide

## 📋 Quick Start

### Initial Setup
```bash
# Make scripts executable
chmod +x scripts/*.sh

# Setup daily cron (runs at 3 AM)
sudo bash scripts/setup-cron.sh
```

### Manual Backup
```bash
# Create backup now
bash scripts/backup.sh
```

### Restore Database
```bash
# List available backups
ls -lh backups/

# Restore from backup
bash scripts/restore.sh backup_20240115_120000.sql.gz
```

---

## 🔧 Configuration

### Backup Retention
Edit `.env.local`:
```env
BACKUP_RETENTION_DAYS=7  # Keep backups for 7 days
```

### Backup Schedule
Edit cron file: `/etc/cron.d/panel-backup`
```cron
# Change time (example: 2 AM)
0 2 * * * root cd /path/to/panel && bash scripts/backup.sh
```

---

## 📁 Backup Location

**Local:** `./backups/`

Backups are stored as compressed SQL dumps:
- `backup_20240115_030000.sql.gz` (date_time format)

---

## 🚨 Emergency Restore

**If everything is broken:**

```bash
# 1. Stop services
docker compose down

# 2. Start only database
docker compose up -d db

# 3. Wait for database to be ready
docker compose logs -f db

# 4. Restore backup
gunzip < backups/backup_YYYYMMDD_HHMMSS.sql.gz | \
  docker exec -i panel_db psql -U postgres postgres

# 5. Start all services
docker compose up -d
```

---

## 📤 Optional: Remote Backup

### Copy to Remote Server
Add to `scripts/backup.sh` (after line 28):

```bash
# Copy to remote server via SCP
REMOTE_USER="backup"
REMOTE_HOST="192.168.1.100"
REMOTE_PATH="/backups/panel"

scp "$BACKUP_FILE" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/"
```

### Setup SSH Key (no password)
```bash
ssh-keygen -t ed25519 -C "panel-backup"
ssh-copy-id backup@192.168.1.100
```

---

## ✅ Verify Backups

```bash
# Check backup integrity
gunzip -t backups/backup_*.sql.gz

# View backup size
du -h backups/

# Count backups
ls backups/ | wc -l
```

---

## 📊 Monitoring

```bash
# View backup logs
tail -f /var/log/panel-backup.log

# Check cron status
sudo service cron status

# List cron jobs
sudo crontab -l
```

---

## 🎯 Best Practices

✅ Test restore monthly  
✅ Keep 7+ days of backups  
✅ Monitor backup logs  
✅ Copy important backups offsite  
✅ Verify backup integrity  

❌ Don't delete backups manually  
❌ Don't store passwords in scripts  
❌ Don't skip testing restores  
