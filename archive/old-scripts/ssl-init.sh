#!/bin/bash
set -euo pipefail

# ══════════════════════════════════════════════
# Seema SSL Certificate Setup (Let's Encrypt)
# Run ONCE on first deployment
# Usage: ./scripts/ssl-init.sh
# ══════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

# Load env
source .env 2>/dev/null || true
DOMAIN="${DOMAIN:-seemaai.co.uk}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@seemaai.co.uk}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[SSL]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }

log "Setting up SSL for ${DOMAIN}..."

# Step 1: Temporarily swap to HTTP-only nginx config for challenge
log "Creating temporary HTTP-only config for ACME challenge..."
cat > /tmp/seema_temp_ssl.conf << 'TMPCONF'
server {
    listen 80;
    server_name _;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 200 'Seema SSL setup in progress';
        add_header Content-Type text/plain;
    }
}
TMPCONF

# Backup current config
cp nginx/seemaai.conf nginx/seemaai.conf.bak
cp /tmp/seema_temp_ssl.conf nginx/seemaai.conf

# Start nginx with HTTP-only config
log "Starting nginx for ACME challenge..."
docker compose up -d nginx

sleep 3

# Step 2: Request certificate
log "Requesting certificate from Let's Encrypt..."
docker compose run --rm certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email "$ADMIN_EMAIL" \
    --agree-tos \
    --no-eff-email \
    -d "$DOMAIN" \
    -d "www.${DOMAIN}"

# Step 3: Restore production config
log "Restoring production nginx config..."
cp nginx/seemaai.conf.bak nginx/seemaai.conf
rm -f nginx/seemaai.conf.bak

# Step 4: Reload nginx with SSL
log "Reloading nginx with SSL..."
docker compose restart nginx

log "SSL setup complete!"
log "Certificate will auto-renew via the certbot container."
warn "Test with: curl -I https://${DOMAIN}"
