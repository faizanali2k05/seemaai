# Seema — Deployment Guide

**Bundle date:** 2026-05-14
**Target:** Linux VPS (Ubuntu 22.04+) with Docker + Docker Compose v2 installed.
**Domain in examples:** `seemaai.co.uk` (replace with yours).

This guide assumes a single-host docker-compose deployment. For a clustered
deployment talk to the team — the RLS + worker patterns scale further but
need DB connection pooling.

---

## 1. Host prerequisites

```bash
# Docker Engine + Compose plugin (Ubuntu)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER  # log out + back in

# Verify
docker compose version    # expect: Docker Compose version v2.x+
```

You also need:

* TCP 80 + 443 open
* DNS for your domain pointing at the host (A record)
* At least 4 GB RAM, 2 vCPU, 20 GB disk for the minimum viable deployment

---

## 2. First-time bootstrap

```bash
unzip Seema-Deploy-2026-05-14.zip -d /opt/seema
cd /opt/seema
```

### 2a. Configure secrets

For **each** of the three services, copy the example env and fill in real values:

```bash
cp seema-api/.env.example seema-api/.env
cp seema-node/.env.example seema-node/.env
cp seema-web/.env.example seema-web/.env       # if present
```

**Critical fields to set before first boot:**

| Service | Variable | Notes |
| - | - | - |
| seema-api | `JWT_SECRET_KEY` | `python -c "import secrets; print(secrets.token_hex(32))"` |
| seema-api | `ADMIN_DATABASE_URL` | `postgresql+asyncpg://seema_admin:STRONG-PW@db:5432/seema` |
| seema-api | `DATABASE_URL` | `postgresql+asyncpg://seema_app:DIFFERENT-PW@db:5432/seema` |
| seema-api | `ANTHROPIC_API_KEY` | Required for AI features (regulatory, breach, matter review) |
| seema-api | `SENDGRID_API_KEY` | Required for emails; without it the worker logs but does not send |
| seema-api | `STRIPE_SECRET_KEY` | Only if billing enabled |
| seema-node | `DATABASE_URL` | `postgresql://seema_app:SAME-AS-API@db:5432/seema?schema=public` |
| seema-node | `DIRECT_URL` | `postgresql://seema_admin:SAME-AS-API@db:5432/seema?schema=public` (Prisma migrations) |
| seema-node | `JWT_SECRET_KEY` | **MUST MATCH** seema-api's value |
| seema-node | `REDIS_URL` | `redis://redis:6379/0` |
| docker-compose.yml | `db.POSTGRES_PASSWORD` | Postgres superuser password — used during bootstrap only |

If `DATABASE_URL` (app user) and `ADMIN_DATABASE_URL` (admin) point at different roles,
you must create those roles first — see step 2c.

### 2b. nginx + TLS

Edit `nginx/seemaai.conf` to use your domain.

For Let's Encrypt:

```bash
docker compose --profile certbot run certbot \
  certonly --webroot -w /var/www/certbot \
  -d yourdomain.com
```

Swap the `nginx.volumes` block in `docker-compose.yml` from `local.conf` to your
production config (the commented-out lines).

### 2c. Boot the database + create roles

```bash
docker compose up -d db
docker compose exec db psql -U seema -d seema <<'SQL'
-- Application role (non-superuser, RLS applies)
CREATE ROLE seema_app LOGIN PASSWORD 'YOUR-APP-PASSWORD';
GRANT CONNECT ON DATABASE seema TO seema_app;
GRANT USAGE ON SCHEMA public TO seema_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO seema_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO seema_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO seema_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO seema_app;

-- Admin role (BYPASSRLS — used for migrations, webhooks, cross-tenant jobs)
CREATE ROLE seema_admin LOGIN PASSWORD 'YOUR-ADMIN-PASSWORD' BYPASSRLS;
GRANT CONNECT ON DATABASE seema TO seema_admin;
GRANT ALL ON SCHEMA public TO seema_admin;
GRANT ALL ON ALL TABLES IN SCHEMA public TO seema_admin;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO seema_admin;
SQL
```

### 2d. Apply migrations (Alembic owns the schema)

```bash
docker compose up -d api    # api container has alembic installed
docker compose exec api alembic upgrade head
```

If you see `permission denied for schema public` or `must be owner of table X`,
your `ADMIN_DATABASE_URL` either isn't set or points at a non-privileged role.
Confirm via `docker compose exec api env | grep DATABASE_URL`.

Verify:

```bash
docker compose exec api alembic current
# Expected: a single revision id with "(head)" suffix
```

### 2e. One-time ownership fix (rare but lasts forever)

If migrations were originally applied by the `seema` superuser instead of
`seema_admin`, future `ALTER TABLE` migrations will fail with
"must be owner of table". Run this once:

```bash
docker compose exec -T db psql -U seema -d seema <<'SQL'
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO seema_admin', r.tablename);
  END LOOP;
END $$;
SQL
```

### 2f. Generate Prisma client + boot everything

```bash
docker compose up -d
# That starts: db, redis, api, celery-worker, celery-beat,
#              node-api, node-workers, web, nginx
```

The first boot of `node-api` runs `npx prisma generate` against the current
schema. If you change the schema later you must:

```bash
docker compose exec node-api npx prisma db pull
docker compose exec node-api npx prisma generate
docker compose restart node-api node-workers
```

---

## 3. Smoke-test checklist

See `SMOKE_TEST.md` for the full version. Bare minimum:

1. `curl https://yourdomain.com/api/healthz` → `{"ok": true}`
2. Register an admin user via `/register`
3. Log in via `/login`
4. Hit `/dashboard` — should load with 200, not a 500
5. Open `/compliance-scan`, run a scan, wait for alerts to appear
6. Open `/breaches`, create a test breach — ICO countdown should show
7. Open `/regulatory`, click an update — staff acknowledgement section should appear

If any of these fail, check:

* `docker compose logs node-api --tail 100`
* `docker compose logs api --tail 100`
* `docker compose logs node-workers --tail 100`

Most production issues at this stage are env-var mismatches — particularly
`JWT_SECRET_KEY` not matching between node-api and api, or `DATABASE_URL`
pointing at the wrong role.

---

## 4. Day-to-day operations

### Updating code

```bash
git pull   # if you've put this on a git remote
docker compose build api node-api node-workers web
docker compose up -d api node-api node-workers web
```

### Applying new migrations

```bash
docker compose exec api alembic upgrade head
docker compose exec node-api npx prisma db pull
docker compose exec node-api npx prisma generate
docker compose restart node-api node-workers
```

### Backups

```bash
# Daily dump (add to cron)
docker compose exec -T db pg_dump -U seema seema | gzip > seema-$(date +%F).sql.gz
```

Restore:

```bash
gunzip -c seema-2026-05-14.sql.gz | docker compose exec -T db psql -U seema -d seema
```

---

## 5. Architecture (one-paragraph orientation)

Three application services on top of Postgres + Redis:

* **seema-api** (Python/FastAPI, port 8000) — owns the schema (Alembic),
  AI calls to Anthropic, Celery tasks for non-tenant-scoped scheduled work.
* **seema-node** (TypeScript/Express + Prisma, port 4000) — primary API
  serving the web app. Proxies AI requests to seema-api. Also runs BullMQ
  workers for emails, billing, compliance alerts.
* **seema-web** (Next.js 14, port 3000) — UI. Talks to node-api via
  `NEXT_PUBLIC_API_URL`.

Nginx terminates TLS and routes `/api/*` to seema-node and everything else
to seema-web.

Row-Level Security is enforced at the Postgres layer. Application code
connects as `seema_app` (non-superuser). The RLS policy compares
`firm_id` against the session GUC `app.current_firm_id`, which is set
by the tenant middleware on every request. Workers and webhooks
connect as `seema_admin` (BYPASSRLS).

---

## 6. New features in this build

Five features landed since the last bundle:

1. **Regulatory acknowledgements** — per-staff read-tracking on regulatory updates.
2. **Breach ICO 72-hour countdown + AI notification draft** — Article 33 helper.
3. **SRA Annual Return section stepper** — accept/override/skip per section with audit trail.
4. **Audit + PII pack send-to-recipient** — email packs directly to inspectors/brokers.
5. **CPD hours dashboard** — per-staff continuing professional development tracking.
6. **Supervision session log** — cadence-based supervision register with auto-chase.

(plus dozens of bug fixes and schema reconciliation work — see git log)

---

## 7. Where things live

```
/opt/seema/
├── docker-compose.yml          # service definitions
├── nginx/                      # reverse-proxy config
├── seema-api/                  # FastAPI service + Alembic migrations
│   ├── alembic/versions/       # schema source of truth
│   ├── routers/                # FastAPI routes
│   ├── services/               # AI orchestration (ai_analysis.py)
│   └── workers/                # Celery tasks
├── seema-node/                 # Express API + BullMQ workers
│   ├── prisma/schema.prisma    # Prisma client model (pulled from DB)
│   ├── src/routes/             # API route handlers
│   ├── src/workers/            # BullMQ job processors
│   └── dist/                   # compiled output (built in container)
├── seema-web/                  # Next.js app
│   └── src/app/                # routes (file-based)
└── scripts/                    # ops helpers
```

---

## 8. If you get stuck

* `HANDOFF.md` — broader handoff doc with codebase tour
* `SMOKE_TEST.md` — full QA checklist
* `SCHEMA.md` — data model reference
* `API_ENDPOINTS_COMPREHENSIVE.md` — every route documented
