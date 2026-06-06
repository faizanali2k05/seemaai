# Seema — Compliance Operating System for UK Law Firms

Seema is a multi-tenant SaaS that gives **Compliance Officers for Legal Practice
(COLPs)** a single dashboard to manage **SRA** compliance, AML/intake, conflicts,
breaches, policies, staff training, client accounts, the annual SRA return and
audit pack — with AI assistance from Anthropic Claude.

---

## 📂 Where everything lives (start here)

```
seemaai/
├── frontend/          → The web app / UI (Next.js).         "Screen pe jo dikhta hai"
├── backend/           → The API + database + jobs (FastAPI). "Saara logic + data"
├── deploy/            → How it runs in production.
├── docs/              → All documentation.
├── archive/           → Old / unused files (safe to ignore).
├── docker-compose.yml → One command runs the whole stack from here.
├── .env               → Your secrets (created by the generator; gitignored).
└── README.md          → This file.
```

### Frontend — `frontend/`  (Next.js)
```
frontend/src/
├── app/           → Pages & routing. Each folder = one URL/page.
│                    e.g. app/dashboard/page.tsx  → /dashboard
│                         app/breaches/page.tsx   → /breaches
├── components/    → Reusable UI (buttons, tables, charts, layout).
└── lib/           → API client (api.ts), auth store, hooks, helpers.
```
> **Routing rule:** in Next.js the folder name *is* the route. A page lives at
> `app/<name>/page.tsx` and is served at `/<name>`.

### Backend — `backend/`  (FastAPI)
```
backend/
├── main.py        → App entry. Mounts all routers under /api.
├── routers/       → API endpoints (the routing).  e.g. routers/breach.py → /api/breach/...
├── models/        → Database tables (SQLAlchemy).  This defines the schema.
├── services/      → Business logic (AI, Clio sync, regulatory scrapers, PDF, email).
├── tasks/         → Background jobs (Celery): scrapers, chasers, digests.
├── middleware/    → Auth, tenant isolation (RLS), rate limiting, tiers.
├── alembic/       → Database migrations (schema version history).
├── scripts/       → apply_rls.py (sets up tenant security after migrations).
└── entrypoint.sh  → On boot: wait for DB → migrate → apply RLS → start server.
```
> **Where is the database?** The *data* lives in Docker (the `pgdata` volume —
> a PostgreSQL 16 container defined in `docker-compose.yml`). The *shape* of the
> database (tables/columns) is defined in `backend/models/` and versioned in
> `backend/alembic/`. There is no "database folder" with the data in it — that's
> normal; the data is managed by Postgres inside the `db` container.

### Deploy — `deploy/`
```
deploy/
├── Caddyfile          → Reverse proxy + automatic HTTPS config.
├── db-init/           → Creates the seema_app / seema_admin DB roles on first boot.
└── scripts/
    ├── generate-secrets.sh / .ps1   → Fills .env with random secrets.
    └── backup.sh                     → Database backup helper.
```

### Docs — `docs/`
`PRD.md` (full product spec), `DEPLOYMENT.md` (step-by-step deploy),
`SCHEMA.md` (DB schema), `API_ENDPOINTS_COMPREHENSIVE.md` (API reference).

---

## 🚀 Run it (VPS or locally with Docker)

```bash
# 1. Create .env with strong random secrets
./deploy/scripts/generate-secrets.sh      # Windows: .\deploy\scripts\generate-secrets.ps1

# 2. Open .env and paste your keys (these are the ONLY two you must provide)
#      ANTHROPIC_API_KEY=...
#      CLIO_CLIENT_ID=...  /  CLIO_CLIENT_SECRET=...

# 3. Build & start everything
docker compose up -d --build
```

Then open `https://app.seemaai.co.uk`, **Register** your firm, and log in —
baseline compliance data is seeded automatically on first login.

Full instructions: **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

---

## 🧱 Tech stack

| Layer        | Tech |
| ------------ | ---- |
| Frontend     | Next.js 14, TypeScript, Tailwind, Zustand |
| Backend      | FastAPI (Python 3.11), SQLAlchemy (async) |
| Jobs         | Celery + Redis (worker + beat) |
| Database     | PostgreSQL 16 with Row-Level Security (per-tenant isolation) |
| AI           | Anthropic Claude (graceful rule-based fallback) |
| Proxy / TLS  | Caddy 2 (automatic Let's Encrypt) |
| Orchestration| Docker Compose |

> Want to rebuild from scratch with a unified TypeScript stack instead? See the
> recommended stack and folder structure in **[docs/PRD.md](docs/PRD.md)** §3–4.

---

## 🔄 How a request flows

```
browser ──HTTPS──> Caddy ──/api/*──> backend  (FastAPI, :8000, routes under /api)
                        └──/*──────> frontend (Next.js, :3000)
```

The frontend's API URL is baked at build time to `https://app.seemaai.co.uk/api`,
so app + API share one origin (no CORS headaches).

---

## License
Proprietary — Seema Compliance Ltd. All rights reserved.
