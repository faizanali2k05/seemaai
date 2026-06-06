#!/bin/bash
# ══════════════════════════════════════════════
# Seema Deployment Script
# Builds and deploys all services via Docker Compose
# ══════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Colours ──
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[SEEMA]${NC} $1"; }
ok()   { echo -e "${GREEN}[  OK ]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail() { echo -e "${RED}[FAIL]${NC} $1" >&2; exit 1; }

# ── Pre-flight checks ──
log "Running pre-flight checks..."

command -v docker >/dev/null 2>&1        || fail "Docker is not installed"
command -v docker compose >/dev/null 2>&1 || fail "Docker Compose is not installed"

[ -f ".env" ]              || fail "Missing .env — copy .env.example and fill in values"
[ -f "seema-api/.env" ]    || fail "Missing seema-api/.env — copy seema-api/.env.example and fill in values"

ok "Pre-flight checks passed"

# ── Parse command ──
COMMAND="${1:-deploy}"

case "$COMMAND" in
  build)
    log "Building all images (no cache)..."
    docker compose build --no-cache
    ok "Build complete"
    ;;

  deploy)
    log "Building images..."
    docker compose build

    log "Running database migrations..."
    docker compose run --rm api alembic upgrade head 2>/dev/null || true

    log "Starting all services..."
    docker compose up -d

    log "Waiting for services to be healthy..."
    sleep 5

    # Health checks
    if docker compose ps --format '{{.Service}} {{.Status}}' | grep -q "unhealthy"; then
      warn "Some services are unhealthy:"
      docker compose ps
    else
      ok "All services running"
    fi

    echo ""
    log "Service status:"
    docker compose ps --format 'table {{.Service}}\t{{.Status}}\t{{.Ports}}'
    echo ""
    ok "Deployment complete"
    ;;

  restart)
    log "Restarting services..."
    docker compose restart
    ok "Restart complete"
    ;;

  rebuild-web)
    log "Rebuilding frontend only..."
    docker compose build --no-cache web
    docker compose up -d web
    ok "Frontend rebuilt and deployed"
    ;;

  rebuild-api)
    log "Rebuilding API only..."
    docker compose build --no-cache api celery celery-beat
    docker compose up -d api celery celery-beat
    ok "API rebuilt and deployed"
    ;;

  logs)
    SERVICE="${2:-}"
    if [ -n "$SERVICE" ]; then
      docker compose logs -f --tail=100 "$SERVICE"
    else
      docker compose logs -f --tail=50
    fi
    ;;

  status)
    docker compose ps --format 'table {{.Service}}\t{{.Status}}\t{{.Ports}}'
    echo ""
    log "Disk usage:"
    docker system df --format 'table {{.Type}}\t{{.Size}}\t{{.Reclaimable}}'
    ;;

  stop)
    log "Stopping all services..."
    docker compose down
    ok "All services stopped"
    ;;

  ssl)
    log "Requesting SSL certificate..."
    docker compose run --rm certbot certonly \
      --webroot \
      --webroot-path=/var/www/certbot \
      -d seemaai.co.uk \
      -d www.seemaai.co.uk \
      --email "${ADMIN_EMAIL:-admin@seemaai.co.uk}" \
      --agree-tos \
      --no-eff-email
    docker compose restart nginx
    ok "SSL certificate obtained and Nginx restarted"
    ;;

  backup)
    BACKUP_DIR="./backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$BACKUP_DIR"
    log "Backing up database to $BACKUP_DIR..."
    docker compose exec -T db pg_dump -U seema seema > "$BACKUP_DIR/seema_db.sql"
    ok "Database backed up to $BACKUP_DIR/seema_db.sql"
    ;;

  *)
    echo ""
    echo "Usage: ./deploy.sh [command]"
    echo ""
    echo "Commands:"
    echo "  deploy        Build and start all services (default)"
    echo "  build         Build all images with no cache"
    echo "  restart       Restart all services"
    echo "  rebuild-web   Rebuild and redeploy frontend only"
    echo "  rebuild-api   Rebuild and redeploy API + workers only"
    echo "  logs [svc]    Tail logs (optionally for a specific service)"
    echo "  status        Show service status and disk usage"
    echo "  stop          Stop all services"
    echo "  ssl           Request SSL certificate via Certbot"
    echo "  backup        Backup the PostgreSQL database"
    echo ""
    ;;
esac
