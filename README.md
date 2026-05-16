# Seema — Compliance Operating System for UK Law Firms

Seema is a SaaS platform that gives Compliance Officers for Legal Practice (COLPs) a single dashboard to manage regulatory compliance, risk monitoring, policy governance, and staff training — powered by AI.

Built for firms regulated by the **Solicitors Regulation Authority (SRA)**.

## Tech stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Python 3.11, FastAPI, SQLAlchemy (async), Alembic |
| **Frontend** | Next.js 14, TypeScript, Tailwind CSS, Zustand |
| **Database** | PostgreSQL 15 (asyncpg) |
| **Background tasks** | Celery + Redis |
| **AI** | Anthropic Claude API (claude-sonnet-4-20250514) |
| **Email** | SendGrid |
| **Billing** | Stripe |
| **Infrastructure** | Docker, Nginx, GitHub Actions CI/CD |

## Project structure

```
Seema/
├── seema-api/                 # FastAPI backend
│   ├── main.py                # App entry point
│   ├── config.py              # Settings (env vars)
│   ├── database.py            # SQLAlchemy engine + session
│   ├── celery_app.py          # Celery config + beat schedule
│   ├── routers/               # 30 API router modules
│   ├── models/                # 23 SQLAlchemy ORM models
│   ├── services/              # Business logic
│   │   ├── ai_analysis.py     # Claude AI integration (5 capabilities)
│   │   ├── knowledge_engine.py # Compliance Q&A engine
│   │   ├── billing.py         # Stripe integration
│   │   ├── email_service.py   # SendGrid integration
│   │   ├── chase_engine.py    # Auto-chaser logic
│   │   ├── sra_lookup.py      # SRA register lookup
│   │   └── scrapers/          # Regulatory feed scrapers (SRA, ICO, GOV.UK, Law Society)
│   ├── tasks/                 # Celery background tasks
│   │   ├── compliance_tasks.py
│   │   ├── email_tasks.py
│   │   ├── regulatory_tasks.py
│   │   ├── reporting_tasks.py
│   │   └── billing_tasks.py
│   ├── middleware/             # Auth, tenancy, rate limiting
│   ├── alembic/               # Database migrations
│   └── scripts/               # Utility scripts
├── seema-web/                 # Next.js frontend
│   └── src/
│       ├── app/               # 35 page components
│       ├── components/        # Shared UI library
│       └── lib/               # API client, stores, hooks
├── nginx/                     # Nginx reverse proxy config
├── documents/legal/           # DPIA, DPA, Privacy Policy, etc.
├── docker-compose.yml         # Full stack orchestration
└── .github/workflows/         # CI/CD pipeline
```

## Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 15+
- Redis 7+
- Docker & Docker Compose (for containerised deployment)

## Environment variables

Copy the example and fill in your values:

```bash
cp seema-api/.env.example seema-api/.env
```

Required variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string (`postgresql+asyncpg://user:pass@host:5432/seema`) |
| `REDIS_URL` | Redis connection string (`redis://localhost:6379/0`) |
| `JWT_SECRET_KEY` | Random 64-char string for signing tokens |
| `ANTHROPIC_API_KEY` | Anthropic API key for AI features (optional — degrades gracefully) |
| `SENDGRID_API_KEY` | SendGrid API key for email (optional in dev) |
| `STRIPE_SECRET_KEY` | Stripe secret key for billing |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing secret |
| `CORS_ORIGINS` | Comma-separated allowed origins |

## Local development

### Backend

```bash
cd seema-api
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Run database migrations
alembic upgrade head

# Start the API server
uvicorn main:app --reload --port 8000
```

API docs available at `http://localhost:8000/docs` (Swagger) and `http://localhost:8000/redoc`.

### Frontend

```bash
cd seema-web
npm install
npm run dev
```

Frontend runs at `http://localhost:3000`.

### Background tasks

```bash
cd seema-api

# Start Celery worker
celery -A celery_app worker --loglevel=info --queues=compliance,email,default

# Start Celery Beat scheduler (separate terminal)
celery -A celery_app beat --loglevel=info
```

## Docker deployment

Spin up the full stack with one command:

```bash
docker compose up -d
```

This starts: PostgreSQL, Redis, FastAPI (via Gunicorn), Celery worker, Celery Beat, Next.js, and Nginx.

## API overview

The API exposes **122 endpoints** across 30 router modules, grouped by domain:

- **Auth** — login, register, refresh tokens, password reset
- **Dashboard** — COLP overview, compliance score, risk metrics
- **Compliance** — alerts, scans, scores, gap analysis
- **Staff** — profiles, training records, supervision
- **Intake** — new matter onboarding, conflict checks
- **Matters** — case management, file notes
- **AML** — CDD records, SARs, risk assessments
- **Policies** — document management, AI-powered generation
- **Regulatory** — updates feed, AI impact analysis
- **Deadlines & Undertakings** — tracking with auto-chasers
- **Breaches** — incident reporting, ICO notification tracking
- **Billing** — Stripe subscriptions, invoices, feature gating
- **AI** — regulatory analysis, compliance scan, knowledge engine, remediation suggestions, risk summary

All endpoints require JWT authentication and are automatically scoped to the authenticated firm (multi-tenancy).

## AI features

Seema integrates Anthropic's Claude API for five capabilities:

1. **Regulatory impact analysis** — assesses how new SRA/ICO/GOV.UK updates affect the firm
2. **Policy generation** — creates firm-specific compliance policies with regulatory references
3. **Compliance scanning** — AI-powered risk scoring across all compliance areas
4. **Remediation suggestions** — step-by-step action plans for compliance gaps
5. **Knowledge engine** — natural-language Q&A about SRA regulations, GDPR, AML, and firm-specific compliance

All AI features degrade gracefully to rule-based fallbacks when `ANTHROPIC_API_KEY` is not configured.

## Licence

Proprietary — Seema Compliance Ltd. All rights reserved.
