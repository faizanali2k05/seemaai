#!/bin/bash
set -euo pipefail

# ══════════════════════════════════════════════
# Seema Deployment Script
# Usage: ./scripts/deploy.sh [--build] [--migrate]
# ══════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[DEPLOY]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ── Parse flags ──
BUILD=false
MIGRATE=false
for arg in "$@"; do
    case $arg in
        --build)   BUILD=true ;;
        --migrate) MIGRATE=true ;;
        *)         err "Unknown flag: $arg" ;;
    esac
done

# ── Pre-flight checks ──
log "Running pre-flight checks..."

[ -f ".env" ] || err "Missing .env file. Copy .env.example and fill in values."
[ -f "seema-api/.env" ] || err "Missing seema-api/.env file."
command -v docker >/dev/null 2>&1 || err "Docker is not installed."
command -v docker compose >/dev/null 2>&1 || err "Docker Compose v2 is not installed."

# Check for placeholder values
if grep -q "CHANGE_ME" seema-api/.env 2>/dev/null; then
    err "seema-api/.env contains CHANGE_ME placeholder values. Update them before deploying."
fi

log "Pre-flight checks passed."

# ── Pull latest images ──
log "Pulling latest base images..."
docker compose pull db redis nginx certbot

# ── Build if requested ──
if [ "$BUILD" = true ]; then
    log "Building application images..."
    docker compose build --parallel api web
    log "Build complete."
fi

# ── Deploy ──
log "Starting services..."
docker compose up -d

# ── Wait for health ──
log "Waiting for services to become healthy..."
TIMEOUT=120
ELAPSED=0
while [ $ELAPSED -lt $TIMEOUT ]; do
    API_HEALTH=$(docker compose ps api --format json 2>/dev/null | grep -o '"Health":"[^"]*"' | head -1 || echo "")
    DB_HEALTH=$(docker compose ps db --format json 2>/dev/null | grep -o '"Health":"[^"]*"' | head -1 || echo "")

    if echo "$API_HEALTH" | grep -q "healthy" && echo "$DB_HEALTH" | grep -q "healthy"; then
        break
    fi

    sleep 5
    ELAPSED=$((ELAPSED + 5))
    echo -n "."
done
echo ""

if [ $ELAPSED -ge $TIMEOUT ]; then
    warn "Timed out waiting for healthy status. Check logs:"
    warn "  docker compose logs api --tail 50"
    warn "  docker compose logs db --tail 50"
else
    log "All services healthy."
fi

# ── Run migrations if requested ──
if [ "$MIGRATE" = true ]; then
    log "Running database migrations..."
    docker compose exec api alembic upgrade head
    log "Migrations complete."
fi

# ── Status ──
log "Deployment complete. Service status:"
docker compose ps

echo ""
log "Useful commands:"
echo "  docker compose logs -f api        # API logs"
echo "  docker compose logs -f web        # Frontend logs"
echo "  docker compose logs -f nginx      # Nginx logs"
echo "  docker compose exec api alembic upgrade head  # Run migrations"
echo "  ./scripts/backup.sh               # Backup database"
