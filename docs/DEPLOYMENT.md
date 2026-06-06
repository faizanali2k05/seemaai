# Seema — VPS Deployment Guide

**Target VPS:** `root@69.62.110.2` (Ubuntu 22.04+ assumed)
**GitHub repo:** `https://github.com/faizanali2k05/seemaai.git`
**Domains:**
- `seemaai.co.uk` + `www.seemaai.co.uk` → marketing/portfolio site (static, from `seema-marketing/`)
- `app.seemaai.co.uk` → web application (Next.js + Node API + FastAPI stack)
- `n8n.seemaai.co.uk` → reserved for future n8n self-host (DNS already pointed; not deployed by this guide)

Follow every step in order. Estimated time: 60–90 minutes start to finish.

---

## 0a. Claude-driven deployment from VS Code (recommended workflow)

You can let Claude (this assistant) run the entire deploy from your local VS Code terminal so errors are caught and fixed in real time. The flow:

1. **Open a PowerShell terminal in VS Code** (`Ctrl + ` `` ` ``) — keep it focused on this repo's root.
2. **Set up passwordless SSH to the VPS** (one-time, so Claude isn't blocked by password prompts):

   ```powershell
   # If you don't yet have an SSH key
   ssh-keygen -t ed25519 -C "seemaai-deploy"
   # Copy it to the VPS (will prompt for the root password once)
   type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@69.62.110.2 "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
   # Verify — this should land you in a remote shell without asking for a password
   ssh root@69.62.110.2 "echo connected"
   ```

3. **Tell Claude:** "deploy seema — follow deployment.md from step 2 onward." Claude will then issue commands of the form `ssh root@69.62.110.2 "<command>"` from this terminal, read the output, and react to errors immediately.
4. **Have your API keys ready** before starting (paste them into chat when Claude asks): `ANTHROPIC_API_KEY`, `SENDGRID_API_KEY`, and optionally `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET`.

> Why this beats running the script blindly: each command runs as a one-off SSH call, so Claude sees stdout/stderr for every step. If `alembic upgrade head` errors or nginx fails to start, Claude reads the log line that caused it and patches forward — not retroactively.

---

## 0. Before you start — what you need

- SSH access to `root@69.62.110.2` (you should already have a password or key from your VPS provider)
- Access to the DNS panel for `seemaai.co.uk` (wherever you bought the domain — GoDaddy, Namecheap, 123-Reg, Cloudflare, etc.)
- API keys that you will paste into the env files later:
  - `ANTHROPIC_API_KEY` (required for AI features)
  - `SENDGRID_API_KEY` (required for outbound email)
  - `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` (only if billing is enabled)
- A working local copy of this repo

---

## 1. DNS — point your domain at the VPS ✅ DONE

DNS A records for `@`, `www`, `app`, and `n8n` already point to `69.62.110.2` (TTL 14400 / 300 for n8n). Confirm propagation from your local machine before continuing:

```powershell
nslookup seemaai.co.uk          # should return 69.62.110.2
nslookup www.seemaai.co.uk
nslookup app.seemaai.co.uk
```

If any of those don't yet resolve to `69.62.110.2`, wait 5–30 minutes and retry — Let's Encrypt issuance in Step 5 will fail otherwise.

> The `n8n` record is for a future self-hosted n8n install — this guide does not deploy it. Leaving the DNS record in place is harmless.

---

## 2. Initial VPS setup

From your local terminal:

```bash
ssh root@69.62.110.2
```

Then on the VPS:

### 2a. Update + install basics

```bash
apt update && apt upgrade -y
apt install -y git curl ufw fail2ban unattended-upgrades
```

### 2b. Create a non-root deploy user (optional but recommended)

```bash
adduser seema             # set a strong password
usermod -aG sudo seema
# Copy your root SSH key over so you can log in as 'seema'
rsync --archive --chown=seema:seema ~/.ssh /home/seema
```

From now on prefer `ssh seema@69.62.110.2` and `sudo` for privileged commands. (If you skip this, just run everything as root — it works, but is less secure.)

### 2c. Firewall

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status        # should show 22, 80, 443 ALLOW
```

**Important:** Postgres (5432) and Redis (6379) must NOT be exposed publicly. The docker-compose currently maps 5432 publicly; we will fix this in Step 4d.

### 2d. Install Docker + Compose

```bash
curl -fsSL https://get.docker.com | sh
usermod -aG docker $USER     # so 'seema' can run docker without sudo
# Log out and back in for group change to take effect:
exit
ssh seema@69.62.110.2

docker --version
docker compose version       # expect v2.x+
```

### 2e. Swap (only if your VPS has < 4 GB RAM)

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

---

## 3. Get the code onto the VPS — clone from GitHub

The repo is already published at `https://github.com/faizanali2k05/seemaai.git`. On the VPS:

```bash
sudo mkdir -p /opt/seema
sudo chown $USER:$USER /opt/seema
cd /opt
git clone https://github.com/faizanali2k05/seemaai.git seema
cd seema
```

> If the repo is **private**, generate a fine-grained GitHub PAT with `repo:read` scope and clone with `git clone https://<PAT>@github.com/faizanali2k05/seemaai.git seema` — or set up a deploy key (`ssh-keygen` on the VPS, add the `.pub` to GitHub → Repo → Settings → Deploy keys, then clone via the `git@github.com:...` URL).

Pulling future updates is just `cd /opt/seema && git pull` — see Step 9.

---

## 4. Configure secrets and split traffic between domains

### 4a. Generate secrets

On the VPS, generate values you'll paste into env files below:

```bash
# JWT secret (use the same value in seema-api and seema-node)
openssl rand -hex 32
# DB passwords — generate two different ones
openssl rand -base64 24    # for seema_app
openssl rand -base64 24    # for seema_admin
```

Keep these in a notes file locally — you'll lose them if you don't.

### 4b. seema-api/.env

```bash
cd /opt/seema
cp seema-api/.env.example seema-api/.env
nano seema-api/.env
```

Set at minimum:

```ini
JWT_SECRET_KEY=<the openssl hex output>
DATABASE_URL=postgresql+asyncpg://seema_app:<APP_PW>@db:5432/seema
ADMIN_DATABASE_URL=postgresql+asyncpg://seema_admin:<ADMIN_PW>@db:5432/seema
REDIS_URL=redis://redis:6379/0
ANTHROPIC_API_KEY=sk-ant-...
SENDGRID_API_KEY=SG.xxx
STRIPE_SECRET_KEY=sk_live_xxx      # only if using billing
ENVIRONMENT=production
FRONTEND_URL=https://app.seemaai.co.uk
```

### 4c. seema-node/.env

```bash
cp seema-node/.env.example seema-node/.env
nano seema-node/.env
```

```ini
JWT_SECRET_KEY=<SAME value as seema-api>
DATABASE_URL=postgresql://seema_app:<APP_PW>@db:5432/seema?schema=public
DIRECT_URL=postgresql://seema_admin:<ADMIN_PW>@db:5432/seema?schema=public
REDIS_URL=redis://redis:6379/0
NODE_ENV=production
FRONTEND_URL=https://app.seemaai.co.uk
```

### 4d. Patch docker-compose.yml (close DB/Redis to the public)

Open [docker-compose.yml](docker-compose.yml) and remove the public port mappings for `db` and `redis` — they should only be reachable from inside the Docker network. Find and **delete** these two blocks:

```yaml
# In the db service:
    ports:
      - "5432:5432"

# In the redis service:
    ports:
      - "6379:6379"
```

Also update the `web` service so the browser-side API URL points at the production subdomain:

```yaml
  web:
    build:
      context: ./seema-web
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_API_URL: https://app.seemaai.co.uk/api
    restart: unless-stopped
    # ...rest unchanged
```

> The `NEXT_PUBLIC_API_URL` is baked into the JS bundle at build time — it must be the **public** URL the browser will use, not `http://api:8000`.

### 4e. Set the DB passwords on the postgres container

In `docker-compose.yml`, the `db` service has hardcoded `POSTGRES_PASSWORD: seema`. Either leave it (it's only used to bootstrap and then we create proper roles), or change it to a real password. Leaving it is fine because the public port is now closed.

### 4f. Replace the nginx config with a two-domain version

Create [nginx/seemaai-app.conf](nginx/seemaai-app.conf) on the VPS:

```bash
nano nginx/seemaai-app.conf
```

Paste this entire block:

```nginx
# ─────────────────────────────────────────────
#  seemaai.co.uk — marketing / portfolio (static)
# ─────────────────────────────────────────────
server {
    listen 80;
    server_name seemaai.co.uk www.seemaai.co.uk;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name seemaai.co.uk www.seemaai.co.uk;

    ssl_certificate     /etc/letsencrypt/live/seemaai.co.uk/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/seemaai.co.uk/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    server_tokens off;

    root /usr/share/nginx/marketing;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}

# ─────────────────────────────────────────────
#  app.seemaai.co.uk — web application
# ─────────────────────────────────────────────
server {
    listen 80;
    server_name app.seemaai.co.uk;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name app.seemaai.co.uk;

    ssl_certificate     /etc/letsencrypt/live/app.seemaai.co.uk/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/app.seemaai.co.uk/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains; preload" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
    server_tokens off;

    # Auth — stricter rate limit
    location /api/auth/login {
        limit_req zone=login burst=3 nodelay;
        proxy_pass http://node_api/api/auth/login;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }
    location /api/auth/register {
        limit_req zone=login burst=3 nodelay;
        proxy_pass http://node_api/api/auth/register;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }

    # Stripe webhooks — no rate limit
    location /api/billing/webhooks/stripe {
        proxy_pass http://node_api/api/billing/webhooks/stripe;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }

    # General API
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://node_api/api/;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_connect_timeout 10s;
        proxy_send_timeout 60s;
        proxy_read_timeout 180s;
        proxy_buffering off;
    }

    location /health {
        proxy_pass http://node_api/api/health;
        access_log off;
    }

    # Next.js static
    location /_next/static/ {
        proxy_pass http://web_frontend;
        expires 365d;
        add_header Cache-Control "public, immutable";
        access_log off;
    }
    location /_next/image {
        proxy_pass http://web_frontend;
        expires 60d;
    }
    location /favicon.ico {
        proxy_pass http://web_frontend;
        access_log off;
    }

    # Next.js app
    location / {
        limit_req zone=general burst=30 nodelay;
        proxy_pass http://web_frontend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 4g. Wire nginx to serve the marketing site + use the new config

Edit [docker-compose.yml](docker-compose.yml) — replace the `nginx` service block with:

```yaml
  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./nginx/seemaai-app.conf:/etc/nginx/conf.d/default.conf:ro
      - ./seema-marketing:/usr/share/nginx/marketing:ro
      - certbot-webroot:/var/www/certbot:ro
      - certbot-certs:/etc/letsencrypt:ro
    depends_on:
      - api
      - web
      - node-api
```

---

## 5. First boot — bootstrap the database, then issue SSL

### 5a. Start Postgres only and create DB roles

```bash
cd /opt/seema
docker compose up -d db
docker compose exec db psql -U seema -d seema <<'SQL'
CREATE ROLE seema_app   LOGIN PASSWORD 'PASTE_APP_PW_HERE';
CREATE ROLE seema_admin LOGIN PASSWORD 'PASTE_ADMIN_PW_HERE' BYPASSRLS;

GRANT CONNECT ON DATABASE seema TO seema_app, seema_admin;
GRANT USAGE  ON SCHEMA public  TO seema_app;
GRANT ALL    ON SCHEMA public  TO seema_admin;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO seema_app;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO seema_app;
GRANT ALL                            ON ALL TABLES    IN SCHEMA public TO seema_admin;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO seema_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO seema_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO seema_admin;
SQL
```

### 5b. Run Alembic migrations

```bash
docker compose up -d api
docker compose exec api alembic upgrade head
docker compose exec api alembic current     # should show "(head)"
```

### 5c. Temporary HTTP-only nginx for the SSL challenge

Before we have certificates, nginx will refuse to start with the production config above (it references files that don't exist yet). Use a stub config for the very first run:

```bash
nano nginx/bootstrap.conf
```

Paste:

```nginx
server {
    listen 80 default_server;
    server_name _;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 200 'ok'; }
}
```

Temporarily edit `docker-compose.yml` and swap `seemaai-app.conf` → `bootstrap.conf` in the nginx volumes, then:

```bash
docker compose up -d nginx
curl http://seemaai.co.uk         # should print 'ok'
curl http://app.seemaai.co.uk     # should print 'ok'
```

If those don't return `ok`, DNS hasn't propagated — wait and retry. **Do not proceed to 5d until both work.**

### 5d. Issue Let's Encrypt certificates

```bash
docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
  --email admin@seemaai.co.uk --agree-tos --no-eff-email \
  -d seemaai.co.uk -d www.seemaai.co.uk

docker compose run --rm certbot certonly --webroot -w /var/www/certbot \
  --email admin@seemaai.co.uk --agree-tos --no-eff-email \
  -d app.seemaai.co.uk
```

Both commands should end with `Successfully received certificate.` and show paths under `/etc/letsencrypt/live/...`.

### 5e. Switch nginx back to the production config

Revert the docker-compose change you made in 5c (use `seemaai-app.conf` again), then:

```bash
docker compose restart nginx
docker compose logs nginx --tail 30      # check for "ready to handle connections"
```

---

## 6. Bring up the full stack

```bash
docker compose up -d --build
docker compose ps         # everything should be 'running'
```

The first build will take 5–10 minutes (Next.js compilation is the slowest step). Subsequent builds are much faster.

Check logs if anything is unhealthy:

```bash
docker compose logs api          --tail 80
docker compose logs node-api     --tail 80
docker compose logs node-workers --tail 80
docker compose logs web          --tail 80
docker compose logs nginx        --tail 80
```

---

## 7. Smoke test

From your laptop browser / curl:

```bash
curl -I https://seemaai.co.uk            # 200 from marketing site
curl -I https://www.seemaai.co.uk        # 200, same
curl -I https://app.seemaai.co.uk        # 200 from Next.js
curl https://app.seemaai.co.uk/health    # {"ok": true} or similar
```

Then in a browser:

1. Visit `https://seemaai.co.uk` — your portfolio/marketing site loads.
2. Visit `https://app.seemaai.co.uk` — the Next.js app loads, padlock is green.
3. Register a user, log in, hit the dashboard.
4. Run a compliance scan to confirm Celery + Anthropic are wired.

If anything 500s, the cause is almost always env vars — check the JWT secret matches between `seema-api/.env` and `seema-node/.env`, and that DATABASE_URL points at `seema_app`, not `seema`.

---

## 8. Auto-renew SSL (cron)

Let's Encrypt certs expire every 90 days. Add a renewal cron:

```bash
sudo crontab -e
```

Add:

```cron
0 3 * * * cd /opt/seema && docker compose run --rm certbot renew --quiet && docker compose exec nginx nginx -s reload
```

---

## 9. Day-to-day operations

```bash
# Update code
cd /opt/seema && git pull
docker compose build api node-api node-workers web
docker compose up -d api node-api node-workers web

# Apply new migrations
docker compose exec api alembic upgrade head
docker compose exec node-api npx prisma db pull
docker compose exec node-api npx prisma generate
docker compose restart node-api node-workers

# Daily DB backup (add to root cron)
0 2 * * * cd /opt/seema && docker compose exec -T db pg_dump -U seema seema | gzip > /opt/seema/backups/seema-$(date +\%F).sql.gz

# Logs
docker compose logs -f api
docker compose logs -f --tail=100

# Restart one service
docker compose restart node-api
```

Helper script already in the repo: `./deploy.sh deploy | logs | status | backup | ssl`.

---

## 10. Scaling notes (when you outgrow the single VPS)

You'll notice trouble in this order:

| Symptom                          | Fix                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------- |
| Postgres CPU pegged              | Move to a managed PG (DigitalOcean, AWS RDS, Neon). Set `DATABASE_URL` to it.    |
| `node-api` p95 latency rising    | Bump `node-api` replicas: `docker compose up -d --scale node-api=3` + LB tweaks. |
| Celery/BullMQ queue backing up   | Bump worker concurrency, then split workers onto their own VPS.                  |
| Web TTFB rising                  | Put Cloudflare in front of `app.seemaai.co.uk` (orange-cloud the DNS record).    |
| Disk filling with Postgres data  | Snapshot + move to managed PG. Don't try to grow the VPS disk forever.           |

The codebase is already structured for this: every API request sets a tenant GUC for RLS, all state lives in Postgres/Redis, and the workers are queue-driven. No code changes needed to split tiers — only infra.

---

## 11. Troubleshooting cheatsheet

| Problem                                          | Likely cause                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `nginx: host not found in upstream "node-api"`   | `node-api` container failed to start — check its logs               |
| Certbot fails with "DNS problem"                 | DNS not propagated yet, or A record points at wrong IP              |
| `permission denied for schema public`            | `ADMIN_DATABASE_URL` missing or pointing at `seema_app`             |
| Login works but every other API call 401s        | JWT secrets don't match between `seema-api/.env` and `seema-node/.env` |
| Marketing site shows 404                         | `./seema-marketing:/usr/share/nginx/marketing:ro` volume missing    |
| App loads but API calls go to `http://localhost` | `NEXT_PUBLIC_API_URL` wasn't passed as a build arg — rebuild `web`  |

---

## Done

After step 7 passes:

- `https://seemaai.co.uk` → your portfolio (edit `seema-marketing/index.html` and `docker compose restart nginx` to update)
- `https://app.seemaai.co.uk` → the Seema application
- Both with valid SSL, HSTS, security headers, rate limiting, and HTTP→HTTPS redirects
- Daily DB backup + automated SSL renewal
