#!/bin/bash
# SSL Certificate Setup for seemaai.co.uk
# Run this ONCE on your VPS after DNS is pointing to the server.
# Usage: sudo bash scripts/setup-ssl.sh

set -e

DOMAIN="seemaai.co.uk"
EMAIL="admin@seemaai.co.uk"  # Change to your email

echo "=== Seema SSL Certificate Setup ==="
echo "Domain: $DOMAIN"
echo ""

# Install Certbot if not present
if ! command -v certbot &> /dev/null; then
    echo "Installing Certbot..."
    apt-get update
    apt-get install -y certbot
fi

# Stop Nginx temporarily for standalone verification
docker compose stop nginx 2>/dev/null || true

# Request certificate
certbot certonly \
    --standalone \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    -d "$DOMAIN" \
    -d "www.$DOMAIN" \
    -d "api.$DOMAIN"

# Set up auto-renewal cron job
if ! crontab -l 2>/dev/null | grep -q "certbot renew"; then
    (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && docker compose restart nginx") | crontab -
    echo "Auto-renewal cron job added (runs daily at 3am)"
fi

# Start Nginx again
docker compose up -d nginx

echo ""
echo "=== SSL Setup Complete ==="
echo "Certificates installed at: /etc/letsencrypt/live/$DOMAIN/"
echo "Auto-renewal is configured."
echo "Your site is now available at https://$DOMAIN"
