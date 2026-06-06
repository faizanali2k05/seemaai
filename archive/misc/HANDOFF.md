# Seema — Developer Handoff

This is the current state of Seema as of the handoff date. Everything in
this archive matches what's running in the Docker stack on the original
laptop. Do **not** start work from any earlier copy.

## What's new since the last working copy

If you previously had an older snapshot, here's what changed:

* **PostgreSQL Row-Level Security (RLS)** is now enforced on all 36
  tenant-scoped tables. Application now connects via two roles:
  `seema_app` (RLS-enforced) for tenant queries, and `seema_admin`
  (BYPASSRLS) for system operations like login lookup and Stripe webhooks.
* **Tenant-aware Prisma proxy** in `seema-node/src/lib/prisma.ts` wraps
  every model query in a transaction with `SET LOCAL app.current_firm_id`.
  AsyncLocalStorage carries the firmId from the JWT through the request
  chain. See `seema-node/src/lib/tenantContext.ts`.
* **Workers and Stripe webhook** wrapped in `runWithFirm`/`runWithBypass`
  so cron jobs don't throw `TenantContextMissingError`.
* **Schema authority is Alembic** (Python side). Prisma is generated via
  `prisma db pull` after every Alembic migration. Read `SCHEMA.md` end
  to end before changing the schema.
* **Routing fix**: Express routes are mounted at `/api` (not `/api/<feature>`)
  to match how the route files declare paths. URL collision bug fixed.
* **Lazy Stripe + Redis init** — missing keys no longer crash the API on
  boot. Endpoints fail at call time with a clear message.
* **NEXT_PUBLIC_API_URL** now baked into the web image as a build ARG.
  Default is `http://localhost:4000/api` for local dev (Node API direct,
  bypassing nginx because nginx CORS is broken — see deployment list).
* **Playwright E2E tests** for the 6 critical workflows in
  `seema-web/tests/e2e/`. Setup uses a shared auth fixture; run with
  `npm run test:e2e`.

## Setup (first run)

Prereqs: Docker Desktop, Node 18+ (`brew install node`), GNU make optional.

```bash
# 1. Unzip and enter
unzip seema-handoff.zip -d seema && cd seema

# 2. Set up secrets (ask the original developer for these via 1Password/Signal)
cp seema-node/.env.example seema-node/.env       # then fill in
cp seema-api/.env.example seema-api/.env         # then fill in
# Required keys you'll need:
#   - DATABASE_URL, ADMIN_DATABASE_URL  (postgres connection strings, see below)
#   - JWT_SECRET_KEY                    (32+ char random string; openssl rand -base64 32)
#   - STRIPE_SECRET_KEY (optional for dev — billing endpoints will throw without it)
#   - STRIPE_WEBHOOK_SECRET (optional)
#   - SENDGRID_API_KEY (optional — email jobs silently skip)
#   - ANTHROPIC_API_KEY (FastAPI side — needed for AI interpretation)

# 3. Bring up the stack
docker compose up -d
sleep 10
docker compose ps

# 4. Restore the dev database (one-time)
docker compose exec -T -e PGPASSWORD=seema db psql -U seema -d seema < seema-dev-data.sql

# 5. Set up Postgres roles (one-time — ask original dev for the actual passwords)
SEEMA_ADMIN_PW='ASK-FOR-THIS' SEEMA_APP_PW='ASK-FOR-THIS' \
docker compose exec -T -e ADMIN="$SEEMA_ADMIN_PW" -e APP="$SEEMA_APP_PW" db \
  psql -U seema -d seema -v admin_pw="$SEEMA_ADMIN_PW" -v app_pw="$SEEMA_APP_PW" <<'SQL'
SELECT 'CREATE ROLE seema_admin LOGIN PASSWORD ' || quote_literal(:'admin_pw') || ' BYPASSRLS'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seema_admin') \gexec
SELECT 'CREATE ROLE seema_app LOGIN PASSWORD ' || quote_literal(:'app_pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'seema_app') \gexec
GRANT USAGE ON SCHEMA public TO seema_admin, seema_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO seema_admin, seema_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO seema_admin, seema_app;
SQL

# 6. Set DATABASE_URL and ADMIN_DATABASE_URL in both .env files using
#    those role passwords. See seema-node/prisma/migrations/<rls>/README.md
#    for examples.

# 7. Restart the API to pick up the new credentials
docker compose restart node-api
```

Verify the stack is healthy:

```bash
curl http://localhost:4000/api/health   # Node API
curl http://localhost:8000/health        # FastAPI (if it has /health)
curl http://localhost:3000               # Frontend
```

## Run the E2E tests

```bash
cd seema-web
npm install
npx playwright install chromium
npm run test:e2e:headed
```

The setup test must pass first (registers + logs in a shared E2E user).
Other tests inherit the auth state and run the actual UI flows.

## Schema changes

**Read `SCHEMA.md` first.** Short version:

1. Add the column / change in `seema-api/models/<table>.py` (SQLAlchemy)
2. Generate Alembic migration: `docker compose exec api alembic revision -m "your change" --autogenerate`
3. Review and apply: `docker compose exec api alembic upgrade head`
4. Regenerate Prisma client: `docker compose exec node-api npx prisma db pull && docker compose exec node-api npx prisma generate`
5. Rebuild Node containers: `docker compose build node-api node-workers && docker compose up -d node-api node-workers`
6. Commit BOTH the Alembic migration and `seema-node/prisma/schema.prisma` together

**Forbidden:**
* `prisma migrate dev` — would fight Alembic
* `prisma db push` — would destroy RLS policies
* Hand-editing `seema-node/prisma/schema.prisma` — always regenerate via `db pull`

## Deployment-ready checklist

A full list of items still open before public launch lives in [deployment_checklist
in the repo / shared with the founder]. Highlights:

* Rotate JWT and DB role passwords (the originals are compromised)
* Externalise `POSTGRES_PASSWORD` from `docker-compose.yml`
* Drop `5432:5432` host port mapping in prod
* Fix nginx CORS preflight in `nginx/local.conf` and `nginx/seemaai.conf`
* Set production keys: Stripe, SendGrid, Anthropic, Clio
* Add audit logging for `runWithBypass` calls
* Stand up staging environment
* Backup + restore strategy for Postgres
* No git history exists yet — set up the repo + CI/CD

## What's restored from the dump

`seema-dev-data.sql` contains the dev database as it was at handoff time:
the schema (37 tables), all RLS policies, and any test data including the
E2E test firm. Drop it and recreate from migrations if you'd rather start
clean — the migrations live in `seema-api/alembic/versions/`.

## Architecture quick reference

```
Browser (port 3000, Next.js)
      │
      ▼  HTTP (CORS-allowed for localhost:3000)
Node Express API (port 4000)
      │
      ├── Prisma (with tenant-aware proxy) ──► PostgreSQL
      └── HTTP proxy ──► FastAPI (port 8000, AI middleware only)
                                │
                                └── SQLAlchemy ──► PostgreSQL
                                       (regulatory_interpretations, scrapers)

Background:
  BullMQ workers (Node)  ──► Redis
  Celery workers (Python) ──► Redis  [legacy; being retired]

Production:
  nginx in front of everything; same-origin avoids CORS
```

For anything not covered here, ping the founder.
