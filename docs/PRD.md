# Seema — Product Requirements Document (PRD)

**Product:** Seema — Compliance Operating System for UK Law Firms
**Version:** 1.0 (greenfield build spec)
**Owner:** Seema Compliance Ltd
**Last updated:** 2026-06-06

> This PRD is written so the product can be built **from scratch** with a clean,
> modern stack. It doubles as the canonical feature reference for the existing
> implementation. Where useful, it notes how the current codebase maps to a
> requirement.

---

## 1. Overview

### 1.1 Problem
Law firms regulated by the **Solicitors Regulation Authority (SRA)** must comply
with a sprawling, constantly-changing rulebook: the SRA Standards & Regulations,
AML/CTF regulations, UK GDPR (ICO), the SRA Accounts Rules, and more. Compliance
today is run on spreadsheets, shared inboxes, and memory. The **Compliance
Officer for Legal Practice (COLP)** and **Compliance Officer for Finance &
Administration (COFA)** are personally accountable to the SRA, yet have no single
system that tells them *what is wrong, what is due, and what to do next*.

### 1.2 Solution
Seema is a **multi-tenant SaaS** that gives the COLP a single pane of glass:
- Tracks every regulatory obligation and deadline.
- Auto-ingests regulatory changes (SRA, ICO, Law Society, GOV.UK) and uses AI to
  translate each change into firm-specific actions.
- Runs the operational compliance workflows: client intake/AML, conflicts,
  undertakings, breaches, complaints, policies, staff training & supervision,
  client-account reconciliation, and the annual SRA return / audit pack.
- Nudges humans automatically (chasers, deadline escalations, digests).

### 1.3 Vision statement
> *"Every UK law firm should be able to prove it is compliant, on any day, in one
> click — and Seema should have already done 90% of the work before they ask."*

### 1.4 Goals
- G1 — Reduce time to produce an **SRA audit pack** from days to minutes.
- G2 — Zero **missed statutory deadlines** (e.g. ICO 72-hour breach notification).
- G3 — Turn each regulatory update into a tracked, assignable action automatically.
- G4 — Single source of truth for firm-wide compliance posture (a live risk score).
- G5 — Onboard a new firm to first value in < 15 minutes.

### 1.5 Non-goals (v1)
- Not a full Practice Management System (PMS); Seema **integrates** with Clio
  rather than replacing it.
- Not legal advice / case management; it is a compliance layer.
- No native mobile app in v1 (responsive web only).
- Not multi-jurisdiction in v1 (England & Wales / SRA only; architecture should
  not preclude later expansion).

---

## 2. Target users & personas

| Persona | Role | Primary needs |
| --- | --- | --- |
| **Priya — COLP** | Compliance lead, partner | Firm-wide risk view, regulatory impact, audit readiness, sign-offs |
| **Marcus — COFA** | Finance compliance | Client-account reconciliation, Accounts Rules breaches |
| **Sarah — Practice Manager / Admin** | Operations | Staff training, onboarding, chasing people, data import |
| **John — Fee earner / Solicitor** | Day-to-day | Conflict checks, undertakings, declarations, their own training (staff portal) |
| **Auditor / SRA (external)** | Read-only evidence consumer | Receives the generated audit pack / evidence bundle |

---

## 3. Tech stack (recommended)

The product is AI-heavy, scraping-heavy, and background-job-heavy, on a single
cost-efficient VPS. Recommendation prioritises **one language end-to-end**,
**type-safety**, **low RAM**, and **first-class Postgres RLS**.

### 3.1 Recommended: Unified TypeScript

| Layer | Choice | Why |
| --- | --- | --- |
| **Frontend** | **Next.js 14** (App Router) + TypeScript | SSR + standalone Docker build, mature ecosystem |
| UI | **Tailwind CSS** + **shadcn/ui** + **Recharts** | Fast, consistent, accessible components + charts |
| Client state | **Zustand** + **TanStack Query** | Local UI state + server cache/refetch |
| Forms | **React Hook Form** + **Zod** | Typed validation shared with backend |
| **Backend API** | **NestJS** (TypeScript) | Modular DI architecture fits 30+ domains cleanly |
| **ORM** | **Drizzle ORM** | SQL-first → clean RLS, low overhead, typed |
| **DB** | **PostgreSQL 16** + **Row-Level Security** | DB-enforced tenant isolation |
| **Queue/Jobs** | **BullMQ + Redis** | Scheduled scrapers, chasers, email, AI scans |
| **AI** | **@anthropic-ai/sdk** (Claude) | Regulatory interpretation, drafting, scans |
| **Scraping** | **Cheerio** + **rss-parser** + **undici** | HTML + RSS/Atom regulatory feeds |
| **PDF** | **Playwright (HTML→PDF)** or **pdfkit** | Audit packs, breach letters |
| **Auth** | JWT (access + refresh), **argon2**/bcrypt hashing | Stateless, simple |
| **Validation** | **Zod** everywhere | One schema, FE+BE |
| **Reverse proxy / TLS** | **Caddy 2** | Automatic Let's Encrypt, low footprint |
| **Containerisation** | **Docker Compose** | One-command VPS deploy |
| **Observability** | **Sentry** + **pino** logs | Errors + structured logs |
| **Testing** | **Vitest** (unit) + **Playwright** (e2e) | Fast + real browser flows |
| **CI** | GitHub Actions | Lint, typecheck, test, build images |

### 3.2 Alternative: Python backend
If the team prefers Python for the AI/scraping work, keep the frontend identical
and use **FastAPI + SQLAlchemy (async) + Alembic + Celery**, with
`anthropic`, `beautifulsoup4`, `feedparser`, `reportlab`. *(This is what the
current codebase already uses — see `seema-api/`.)* The PRD below is
stack-agnostic from §5 onward.

> **Decision driver:** choose Unified TypeScript if you value one language + DX
> and a lighter VPS; choose Python if the team is stronger in Python and wants
> the richest AI/scraping/PDF libraries. Both are production-valid.

---

## 4. Recommended folder structure (Unified TypeScript monorepo)

```
seema/
├── apps/
│   ├── web/                          # Next.js 14 frontend
│   │   ├── src/
│   │   │   ├── app/                   # App Router (one folder per feature page)
│   │   │   │   ├── (auth)/login, register
│   │   │   │   ├── (app)/dashboard, regulatory, aml, conflicts, breaches, ...
│   │   │   │   └── staff-portal/      # fee-earner self-service area
│   │   │   ├── components/            # ui/ (shadcn), layout/, charts/
│   │   │   ├── lib/                   # api client, auth store, hooks, utils
│   │   │   └── styles/
│   │   └── Dockerfile
│   │
│   └── api/                          # NestJS backend
│       ├── src/
│       │   ├── main.ts
│       │   ├── app.module.ts
│       │   ├── common/               # guards, interceptors, filters, decorators
│       │   │   ├── tenant/            # RLS context (AsyncLocalStorage), tenant guard
│       │   │   ├── auth/             # JWT strategy, RBAC guard, tier guard
│       │   │   └── audit/            # audit-log interceptor
│       │   ├── modules/              # ONE module per domain (see §8)
│       │   │   ├── auth/  dashboard/  regulatory/  aml/  conflicts/
│       │   │   ├── breaches/  intake/  matters/  undertakings/  complaints/
│       │   │   ├── evidence/  policies/  staff/  supervision/  accounts/
│       │   │   ├── chasers/  deadlines/  key-dates/  remediation/  sra-return/
│       │   │   ├── sra-audit-pack/  integrations/  billing/  onboarding/  ai/
│       │   │   └── data-management/
│       │   ├── queue/                # BullMQ queues + processors + scheduler
│       │   │   ├── workers/          # email, regulatory, compliance, integration
│       │   │   └── schedules.ts      # cron definitions
│       │   ├── services/             # cross-cutting: anthropic, clio, scrapers, pdf, email
│       │   └── db/                   # drizzle schema, client, RLS migrations, seed
│       └── Dockerfile
│
├── packages/
│   ├── shared/                       # Zod schemas + TS types shared FE/BE
│   ├── config/                       # eslint, tsconfig, tailwind presets
│   └── ui/                           # (optional) shared component library
│
├── infra/
│   ├── docker-compose.yml            # db, redis, api, worker, web, caddy
│   ├── Caddyfile
│   └── db-init/                      # role creation + RLS bootstrap SQL
│
├── scripts/                          # generate-secrets, backup, restore
├── .env.example
├── PRD.md
└── README.md
```

**Principle:** one **module** per compliance domain (auth-guarded, tenant-scoped,
audited by default). Shared Zod schemas in `packages/shared` keep the API and UI
contracts in lockstep.

---

## 5. Domain data model (core entities)

Tenant root is **Firm**. Almost every other table carries `firm_id` and is
RLS-protected.

- **Firm** — name, SRA number, COLP/COFA/MLRO, size, practice areas, onboarding
  status, subscription (plan/status/trial), preferences (timezone, auto-chase,
  retention), notification preferences.
- **UserAccount** / **UserSession** — login, role, password hash, lockout, JWT
  sessions.
- **StaffMember** / **StaffTraining** / **SupervisionRecord** / **CPD** — people
  + their training, supervision, CPD targets.
- **ClientIntake** / **CddRecord** / **SarRecord** — onboarding, customer due
  diligence, suspicious activity reports (AML).
- **Matter** / **ConflictCheck** / **ConflictParty** — matters + conflict search.
- **Undertaking** — professional undertakings + status/deadlines.
- **Complaint** — first-tier complaints handling.
- **BreachReport** — data/Accounts-Rules breaches incl. ICO 72-hour fields.
- **PolicyDocument** — firm policies mapped to SRA Code, review cycles.
- **EvidenceDocument** — uploaded evidence for audit.
- **ClientAccount** / **Transaction** / **Reconciliation** — Accounts Rules.
- **KeyDate** / **Deadline** — statutory & firm deadlines.
- **RegulatoryUpdate** (shared, not tenant) / **RegulatoryInterpretation**
  (per-firm AI output) / **RegulatoryAcknowledgement** / **SraFeedLog** (system).
- **RemediationPlan** — AI-drafted action plans.
- **ComplianceAlert** / **ComplianceCheck** / **ComplianceTask** /
  **RiskScore** / **ComplianceScanResult** — the live compliance engine.
- **ChaserLog** — automated chase history.
- **AuditLog** — immutable activity trail (every mutating action).
- **Integration** / **IntegrationSyncLog** — Clio (and future) connections.
- **EmailTemplate** / **EmailQueue** — outbound comms.
- **ImportHistory** — data import/export + retention jobs.

---

## 6. Multi-tenancy & security (cross-cutting, mandatory)

| # | Requirement |
| --- | --- |
| SEC-1 | **DB-level tenant isolation via Postgres RLS.** App connects as a non-privileged role (`seema_app`); every tenant query runs in a transaction with `app.current_firm_id` set. Missing context → zero rows (fail-closed). |
| SEC-2 | A separate **BYPASSRLS admin role** (`seema_admin`) is used only for pre-auth (login/register), cross-firm jobs (scrapers), and migrations. |
| SEC-3 | **JWT auth** — short-lived access token (15 min) + refresh token (7 days); refresh rotation; account lockout after 5 failed logins. |
| SEC-4 | **RBAC** — roles: `colp`, `cofa`, `partner`, `admin`, `solicitor`, `staff`. Route-level role guards. |
| SEC-5 | **Tier gating** — feature access by subscription plan (Starter/Essentials/Professional), enforced server-side. |
| SEC-6 | **Audit trail** — every create/update/delete writes an immutable `AuditLog` row (who/what/when/firm/IP). |
| SEC-7 | **Encryption** — TLS in transit (Caddy); secrets in env, never in repo; passwords hashed (argon2/bcrypt). |
| SEC-8 | **Data retention** — configurable per firm (default 6 years per SRA), enforced by a retention job. |
| SEC-9 | **GDPR** — data export + erasure workflows; DPIA/ROPA artefacts; cookie/privacy policies. |

---

## 7. Non-functional requirements

- **Performance:** P95 API < 300 ms for reads; AI endpoints may take up to 60 s
  (async with progress where possible). Dashboard first paint < 2 s.
- **Availability:** single-VPS target 99.5%; stateless API allows horizontal
  scale later.
- **Backups:** nightly `pg_dump`, 30-day retention, tested restore.
- **Observability:** Sentry error tracking, structured request logs, `/health`.
- **Scalability:** queue-based async for all heavy work; workers scale
  independently of the API.
- **Accessibility:** WCAG 2.1 AA for the dashboard.
- **Browser support:** latest 2 versions of Chrome, Edge, Firefox, Safari.

---

## 8. Feature modules (ALL features)

Each module is tenant-scoped, RBAC-guarded, tier-gated where noted, and audited.
Acceptance criteria use *Given/When/Then* style.

### 8.1 Authentication & firm onboarding
- Register a new firm (firm + admin user + SRA number) → 14-day Professional trial.
- Login / logout / refresh; password change & reset; session list + revoke.
- Multi-step **onboarding wizard**: firm profile, COLP/COFA/MLRO, practice areas,
  size, optional Clio connect, optional data import.
- First-login **auto-seed** of baseline compliance data.
- *AC:* *Given* a new SRA number, *when* I register, *then* a firm + admin are
  created and I’m redirected to onboarding with a trial active.

### 8.2 Dashboard (the COLP cockpit)
- Live **compliance risk score**, open alerts, due/overdue items, trial/plan banner.
- **Daily briefing** — actionable items for today (overdue training, breaches,
  deadlines, undertakings due).
- Trend charts (risk over time, alerts by category).
- Quick links into each workflow.

### 8.3 Regulatory intelligence ⭐ (core differentiator)
- **Automated scrapers** ingest SRA, ICO, Law Society, GOV.UK feeds (every 4h).
- Shared **RegulatoryUpdate** feed for all firms; **SraFeedLog** for scraper health.
- **AI interpretation** per firm: Claude assesses *"how does this update affect
  MY firm?"*, produces impact, affected areas, and a draft **remediation plan**.
- **Acknowledge & assign** — COLP acknowledges an update; tasks created/assigned.
- *AC:* *Given* a new SRA update, *when* the scraper ingests it, *then* each firm
  gets an AI impact summary and (if relevant) suggested actions within one cycle.

### 8.4 AML / Client intake / CDD / SAR
- Multi-tier client **intake** workflow with risk rating.
- **CDD records** (customer due diligence) with document checklist.
- **SAR** (Suspicious Activity Report) logging + MLRO workflow.
- AML risk scoring; source-of-funds prompts.

### 8.5 Conflict checks
- Conflict search across matters/parties before opening a matter.
- Record conflict parties; flag and resolve conflicts with sign-off.

### 8.6 Matters
- Matter register (can sync from Clio); link to conflicts, undertakings,
  key dates, client accounts.

### 8.7 Undertakings + auto-chaser engine ⭐
- Register professional undertakings with owner + due date + status.
- **Chase engine**: automatically emails owners about overdue/upcoming items;
  logs every chase (`ChaserLog`); configurable frequency, max attempts, channel.

### 8.8 Breach reporting ⭐
- Log data/Accounts-Rules breaches; severity; affected data subjects.
- **ICO 72-hour countdown** for personal-data breaches (UK GDPR Art. 33).
- **AI-drafted ICO notification letter**; mark-as-notified with timestamp.
- Breach register export.

### 8.9 Complaints handling
- First-tier complaints log, stages, deadlines, outcomes, Legal Ombudsman signposting.

### 8.10 Policies & governance
- Policy library mapped to **SRA Code of Conduct** requirements.
- **AI policy generation/assistance**; version history; review cycles + reminders.

### 8.11 Staff: training, supervision, CPD, declarations
- Staff directory; **training matrix** (assigned vs completed, overdue flags).
- **CPD** dashboard with targets.
- **Supervision** session logging.
- Annual **declarations**.
- **Staff portal** — fee-earner self-service for their own training/declarations.

### 8.12 Client accounts (COFA / Accounts Rules)
- Client account ledger, transactions, **reconciliations**.
- Accounts-Rules breach detection feeding the breach module.

### 8.13 Key dates & deadlines
- Central deadline register (statutory + firm) with escalation.
- Daily deadline checks; auto-escalate overdue items into alerts.

### 8.14 Remediation
- AI-drafted **remediation plans** from regulatory updates or failed checks;
  assignable tasks with owners and due dates; progress tracking.

### 8.15 Evidence vault
- Upload + tag evidence documents; link to checks/policies/audit pack.

### 8.16 SRA return & audit pack ⭐
- Guided **annual SRA return** quick-fill (stepper) from existing data.
- One-click **SRA audit pack** PDF: policies, training, breaches, conflicts,
  reconciliations, evidence — a complete inspection bundle.

### 8.17 Compliance engine (scans, checks, alerts, risk)
- Scheduled + on-demand **compliance scans**; rule-based + AI checks.
- **ComplianceAlert / Check / Task / RiskScore / ScanResult** model the posture.
- Live firm **risk score** surfaced on the dashboard.

### 8.18 Integrations — Clio PMS ⭐
- OAuth connect to **Clio**; sync matters, contacts, staff (every 8h).
- Sync logs + error surfacing; manual re-sync.

### 8.19 Notifications & email
- Email templates + outbound queue; **weekly compliance digest**;
  deadline/breach/training notifications; per-firm notification preferences and
  quiet hours.

### 8.20 Data management
- Bulk **import/export**; import history; **retention** enforcement;
  GDPR data subject export/erasure.

### 8.21 Billing & subscriptions
- **Stripe** plans (Starter / Essentials / Professional, monthly + annual),
  14-day trial, upgrade/downgrade, webhooks, feature gating by tier.

### 8.22 Admin & settings
- Firm settings, user management (invite/role/deactivate), preferences,
  notification settings, security (sessions).

---

## 9. AI capabilities (Anthropic Claude)

| Use case | Input | Output |
| --- | --- | --- |
| Regulatory impact analysis | A regulatory update + firm profile | Firm-specific impact, affected areas, severity |
| Remediation drafting | Impact / failed check | Step-by-step action plan with owners |
| Policy generation | Policy type + firm context | Draft policy mapped to SRA Code |
| Breach notification drafting | Breach record | ICO notification letter draft |
| Compliance scan reasoning | Firm data snapshot | Risk findings + recommendations |

**Design rules:** every AI feature must **degrade gracefully** to rule-based
behaviour when `ANTHROPIC_API_KEY` is absent; AI output is always **human-reviewed
before action** (draft, not auto-send); prompts are versioned; outputs stored for
audit.

---

## 10. Background jobs & schedule

| Job | Schedule | Purpose |
| --- | --- | --- |
| Scrape SRA / ICO / Law Society / GOV.UK | every 4h | Regulatory feed ingestion |
| Clio sync (all firms) | 3×/day | Matters/contacts/staff |
| Auto-chase overdue items | daily 09:00 | Undertakings/training chasers |
| Weekly digest | Mon 08:00 | Compliance summary email |
| Deadline check | daily 08:00 | Upcoming deadline reminders |
| ICO 72-hour breach check | hourly | Breach countdown alerts |
| Overdue training / supervision / policy review | daily AM | Compliance alerts |
| Overdue deadline escalation | daily 07:45 | Escalate to alerts |
| Data retention enforcement | daily/nightly | Purge per retention policy |

All jobs run on the queue (BullMQ/Celery); cross-firm jobs run under the admin
(BYPASSRLS) role and set per-firm context for each firm’s work.

---

## 11. API design conventions
- All routes under `/api`, versionable (`/api/v1` optional).
- Consistent JSON envelope: `{ data }` on success; `{ error, message, statusCode, code }` on failure.
- Auth via `Authorization: Bearer <jwt>`; refresh via `/api/auth/refresh`.
- Pagination, filtering, sorting standardised; idempotent writes where possible.
- Every mutating endpoint records an audit log.
- OpenAPI/Swagger auto-generated.

---

## 12. Pricing tiers (feature gating)

| Plan | Audience | Indicative features |
| --- | --- | --- |
| **Starter** | Sole / small | Core compliance, deadlines, basic regulatory feed |
| **Essentials** | 2–10 solicitors | + AML, conflicts, breaches, staff training, chasers |
| **Professional** | 10–50 solicitors | + AI interpretation, audit pack, Clio integration, client accounts, full automation |

14-day free trial on Professional. Annual billing discounted vs monthly.
*(Exact prices set in Stripe; tier limits enforced server-side.)*

---

## 13. Deployment & infrastructure
- **Single VPS** (2 vCPU / 4 GB / 40 GB), Ubuntu 22.04/24.04.
- **Docker Compose**: `db` (Postgres 16), `redis`, `api`, `worker(s)`, `web`,
  `caddy`.
- **Caddy** terminates TLS and auto-renews Let's Encrypt for `app.seemaai.co.uk`.
- DNS: `app` → VPS IP (marketing site at the apex hosted separately).
- First boot bootstraps DB roles + RLS automatically; firm data self-seeds on
  first login.
- Secrets in a single gitignored `.env`; only **Anthropic** + **Clio** keys are
  supplied by hand. Nightly DB backups via cron.

---

## 14. Build roadmap (phased)

**Phase 0 — Foundations (Weeks 1–2)**
Monorepo, CI, Docker Compose, Postgres + RLS, auth (register/login/JWT/RBAC),
tenant context, audit log, base UI shell + dashboard skeleton.

**Phase 1 — MVP compliance core (Weeks 3–6)**
Firm onboarding, dashboard with risk score, deadlines/key dates, policies,
staff training, evidence vault, email/notifications, basic compliance
checks/alerts. *Goal: a firm can track obligations and get reminded.*

**Phase 2 — Regulatory intelligence + AI (Weeks 7–10)**
Scrapers (SRA/ICO/LawSoc/GOV.UK), regulatory feed, AI interpretation +
remediation, AI policy generation. *Goal: the core differentiator is live.*

**Phase 3 — Operational workflows (Weeks 11–14)**
AML/intake/CDD/SAR, conflicts, matters, undertakings + chaser engine,
complaints, supervision/CPD, staff portal.

**Phase 4 — Finance + audit + integrations (Weeks 15–18)**
Client accounts/reconciliation, breach module + ICO countdown + AI letter,
SRA return + audit pack PDF, Clio integration.

**Phase 5 — Commercialise + harden (Weeks 19–22)**
Stripe billing + tiers, data import/export + retention, GDPR workflows,
Sentry/observability, backups, security review, e2e test suite, beta launch.

---

## 15. Success metrics
- Time to generate an SRA audit pack: target **< 5 minutes**.
- % regulatory updates auto-converted to tracked actions: target **> 90%**.
- Missed statutory deadlines across active firms: target **0**.
- Firm activation (onboarding → first audit-relevant action): **< 1 day**.
- Trial-to-paid conversion: **> 25%**.
- Monthly active COLPs / firm; NPS from compliance leads.

---

## 16. Risks & mitigations
| Risk | Mitigation |
| --- | --- |
| Regulatory feeds change structure / break scrapers | Per-source adapters, feed-health monitoring (`SraFeedLog`), alerts on zero-result scrapes |
| AI hallucination on legal content | Human-in-the-loop (drafts only), citations, store outputs for audit, rule-based fallback |
| Tenant data leakage | DB-enforced RLS + FORCE, smoke tests, non-superuser app role |
| Single-VPS outage | Nightly tested backups; stateless API ready to scale out |
| Scope creep into full PMS | Integrate (Clio), don’t rebuild; non-goals in §1.5 |

---

## Appendix A — How this maps to the existing codebase
The current implementation already realises most of this PRD using **FastAPI +
SQLAlchemy + Celery** (`backend/`, 30+ routers) and **Next.js** (`frontend/`),
with Postgres RLS, Clio, Stripe, SendGrid, and Anthropic wired in and graceful
degradation when keys are absent. A from-scratch rebuild is therefore optional;
this PRD can guide either a clean rebuild (Unified TypeScript, §3.1) or continued
investment in the existing stack.
