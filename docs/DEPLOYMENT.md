# Seema — VPS Deployment Guide (app.seemaai.co.uk)

This deploys the full Seema stack on a single VPS with Docker Compose and
automatic HTTPS via Caddy. End to end it takes ~10 minutes; the only secrets
you supply by hand are your **Anthropic** and (optionally) **Clio** API keys.

## Stack

| Service        | Image / build        | Purpose                                            |
| -------------- | -------------------- | -------------------------------------------------- |
| `db`           | postgres:16-alpine   | Tenant data, RLS-enforced isolation                |
| `redis`        | redis:7-alpine       | Celery broker + cache                              |
| `api`          | `./backend`          | FastAPI REST API; runs migrations + RLS on boot    |
| `celery-worker`| `./backend`          | Background jobs (email, compliance, regulatory)    |
| `celery-beat`  | `./backend`          | Scheduled scrapers, chasers, digests, Clio sync    |
| `web`          | `./frontend`         | Next.js dashboard (standalone build)               |
| `caddy`        | caddy:2-alpine       | Reverse proxy + automatic Let's Encrypt TLS        |

Recommended VPS: 2 vCPU / 4 GB RAM / 40 GB SSD, Ubuntu 22.04 or 24.04.

---

## 1. DNS

Point the app subdomain at your VPS. The marketing site at the apex
(`seemaai.co.uk`) is hosted separately and is untouched by this stack.

| Type | Host  | Value        |
| ---- | ----- | ------------ |
| A    | `app` | `YOUR_VPS_IP`|

Caddy will not be able to issue a certificate until this record resolves.

---

## 2. Install Docker

```bash
ssh root@YOUR_VPS_IP
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
docker --version && docker compose version
```

> **Ubuntu 24.04 + UFW gotcha:** Docker publishes ports straight through the
> kernel firewall, bypassing UFW rules. Only `caddy` publishes ports here (80,
> 443), which is what you want. Do **not** add UFW `allow` rules expecting them
> to restrict container ports — manage exposure via the `ports:` list in
> `docker-compose.yml` instead.

---

## 3. Clone & configure

```bash
mkdir -p /var/www && cd /var/www
git clone <your-repo-url> seemaai
cd seemaai

# Generate .env with strong random DB passwords + JWT secret:
./deploy/scripts/generate-secrets.sh
```

Now edit `.env` and paste your keys:

```bash
nano .env
```

- `ANTHROPIC_API_KEY=` — from https://console.anthropic.com (AI features).
- `CLIO_CLIENT_ID=` / `CLIO_CLIENT_SECRET=` — from your Clio developer app
  (matter/contact sync). Leave blank to run without Clio.

Everything else (`POSTGRES_PASSWORD`, `SEEMA_APP_PASSWORD`,
`SEEMA_ADMIN_PASSWORD`, `JWT_SECRET_KEY`) is already filled. `DOMAIN` defaults to
`app.seemaai.co.uk` — change it if deploying elsewhere.

---

## 4. Launch

```bash
docker compose up -d --build
```

On first boot, in order:

1. `db` initialises and **creates the `seema_app` + `seema_admin` roles**
   (`deploy/db-init/01-roles.sh`).
2. `api` waits for the DB, runs `alembic upgrade head`, then applies
   **Row-Level Security** policies to every tenant table (`apply_rls.py`).
3. `celery-worker` / `celery-beat` start once `api` is healthy.
4. `web` serves the dashboard.
5. `caddy` obtains a Let's Encrypt certificate for `DOMAIN` and starts proxying.

Check status:

```bash
docker compose ps
docker compose logs -f api      # watch migrations + RLS apply
docker compose logs -f caddy    # watch certificate issuance
```

---

## 5. Create your firm

There is **no manual seeding step**. Open `https://app.seemaai.co.uk`, click
**Register**, and create your firm + admin account. On first login the API
auto-seeds baseline compliance data for the firm (idempotent).

---

## 6. Operations

**Update to latest code (rebuild + rolling restart):**
```bash
git pull && docker compose up -d --build
```

**Nightly database backup (cron, 2 AM):**
```bash
0 2 * * * cd /var/www/seemaai && docker compose exec -T db \
  pg_dump -U seema seema | gzip > /var/backups/seema_$(date +\%F).sql.gz
```

**Restore a backup:**
```bash
gunzip -c /var/backups/seema_YYYY-MM-DD.sql.gz | \
  docker compose exec -T db psql -U seema -d seema
```

**Rotate secrets** (forces a fresh DB — destroys data):
```bash
./deploy/scripts/generate-secrets.sh --force
docker compose down -v && docker compose up -d --build
```

---

## Architecture notes

- **Tenant isolation is enforced in Postgres.** The API connects as the
  non-privileged `seema_app` role; every tenant query runs inside a transaction
  with `app.current_firm_id` set, and RLS returns zero rows if it is unset
  (fail-closed). Pre-auth routes (login/register) and cross-firm jobs use the
  `seema_admin` BYPASSRLS role.
- **`NEXT_PUBLIC_API_URL` is baked into the frontend at build time** as
  `https://$DOMAIN/api`. If you change `DOMAIN`, rebuild `web`
  (`docker compose up -d --build web`).
- **Optional integrations degrade gracefully:** with `SENDGRID_API_KEY` blank,
  emails are logged instead of sent; with `STRIPE_*` blank, billing is disabled;
  with `ANTHROPIC_API_KEY` blank, AI features fall back to rule-based output.
