#!/bin/bash
set -euo pipefail

# ══════════════════════════════════════════════
# Seema Database Backup Script
# Usage: ./scripts/backup.sh
# Cron:  0 2 * * * /path/to/seema/scripts/backup.sh
# ══════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

BACKUP_DIR="$PROJECT_DIR/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/seema_${TIMESTAMP}.sql.gz"
KEEP_DAYS=30

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}[BACKUP]${NC} $1"; }
err() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Check database is running
docker compose ps db --format json 2>/dev/null | grep -q "running" || err "Database container is not running."

# Dump and compress
log "Backing up database to ${BACKUP_FILE}..."
docker compose exec -T db pg_dump -U seema seema | gzip > "$BACKUP_FILE"

# Verify backup
if [ -s "$BACKUP_FILE" ]; then
    SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    log "Backup complete: ${BACKUP_FILE} (${SIZE})"
else
    rm -f "$BACKUP_FILE"
    err "Backup file is empty. Check database connection."
fi

# Clean old backups
log "Removing backups older than ${KEEP_DAYS} days..."
DELETED=$(find "$BACKUP_DIR" -name "seema_*.sql.gz" -mtime +${KEEP_DAYS} -delete -print | wc -l)
log "Removed ${DELETED} old backup(s)."

# Summary
TOTAL=$(find "$BACKUP_DIR" -name "seema_*.sql.gz" | wc -l)
TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
log "Total backups: ${TOTAL} (${TOTAL_SIZE})"
