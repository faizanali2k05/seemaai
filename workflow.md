# Seema — Application Workflow

How the Seema compliance platform works end‑to‑end: data comes from **Clio (PMS)**, is
stored in Seema's database, processed by **AI (OpenAI)**, and shown in the dashboard.

---

## 1. Tech stack

| Layer | Tech | Where |
|---|---|---|
| Frontend | Next.js (React, Tailwind) | `frontend/` → port **3000** |
| Backend API | FastAPI (Python) | `backend/` → port **8000** |
| Database | PostgreSQL 16 (Row‑Level Security per firm) | `db` container |
| Queue / cache | Redis | `redis` container |
| Background jobs | Celery worker + beat | `celery-*` containers |
| Reverse proxy + HTTPS | Caddy | `caddy` (prod only, 80/443) |
| PMS integration | Clio API v4 (EU region, OAuth2) | `services/clio.py` |
| AI | OpenAI `gpt-4o` (direct) | `services/ai_analysis.py` |

---

## 2. The big picture (data flow)

```
                          ┌─────────────────────────────────────────────┐
                          │                  CLIO (PMS)                   │
                          │     matters · contacts · staff · tasks        │
                          └───────────────────────┬───────────────────────┘
                                                   │  OAuth2 (read)  ▲ sync pulls data
                                                   ▼                 │
   ┌──────────┐   HTTPS   ┌──────────────────────────────────────────────────┐
   │ Browser  │ ────────▶ │                  CADDY (prod)                      │
   │ (COLP /  │ ◀──────── │   /  → Next.js web      /api → FastAPI api          │
   │  staff)  │           └───────────┬───────────────────────┬───────────────┘
   └──────────┘                       │                        │
                                      ▼                        ▼
                         ┌─────────────────────┐   ┌──────────────────────────────┐
                         │   FRONTEND (Next)   │   │        BACKEND (FastAPI)       │
                         │  dashboard, file    │──▶│  routers → services            │
                         │  review, scan, etc. │◀──│  • auth (JWT)                  │
                         └─────────────────────┘   │  • ClioSyncEngine              │
                                                    │  • ai_analysis (OpenAI)        │
                                                    └───────┬───────────────┬────────┘
                                                            │               │
                                                  ┌─────────▼──────┐  ┌─────▼──────────┐
                                                  │ PostgreSQL     │  │   OpenAI API   │
                                                  │ (RLS per firm) │  │   gpt-4o       │
                                                  └────────────────┘  └────────────────┘
                                                            ▲
                                                  ┌─────────┴──────────┐
                                                  │ Celery (beat+worker)│  scheduled scans,
                                                  │  + Redis            │  deadline checks…
                                                  └─────────────────────┘
```

**One‑line summary:** `Clio ──sync──▶ Seema DB ──▶ AI (OpenAI) ──▶ Dashboard/Pages`

---

## 3. Login / auth flow

```
User ─▶ POST /api/auth/login {email, password}
          │
          ▼
     FastAPI verifies password ─▶ issues JWT {user_id, firm_id, role}
          │
          ▼
   Browser stores JWT ─▶ sends as `Authorization: Bearer …` on every request
          │
          ▼
   Backend sets Postgres `app.current_firm_id` ─▶ RLS scopes ALL queries to that firm
```
Every firm only ever sees its own data (enforced at the database layer, not just the app).

---

## 4. Clio → Seema sync

```
Connect:  Browser ─▶ /api/integrations/clio/connect ─▶ Clio OAuth consent ─▶ callback
                     stores access_token + refresh_token in `integrations` table
                                              │
Sync:     POST /api/integrations/clio/sync {"sync_type":"full"}
                     │
                     ▼
            ClioSyncEngine (services/clio.py)
                     │  GET /matters, /contacts, /users  (paginated, EU pod)
                     ▼
            UPSERT into Seema DB  (by external_ref → no duplicates on re‑sync)
              • matters   → reference, client_name, matter_type, status, …
              • contacts  → client intakes
              • staff     → staff_members
```
The sync **only reads** from Clio, so a read‑only token is enough to pull data in.

---

## 5. AI flows (OpenAI, direct)

**A) Firm‑wide Compliance Scan**
```
Dashboard "Run Compliance Scan"
   ─▶ POST /api/ai/scan-compliance
        ─▶ _gather_compliance_data()   (counts: CDD, breaches, deadlines, …)
        ─▶ scan_compliance(firm, data) ─▶ OpenAI gpt-4o
        ◀─ {overall_risk_score, overall_rating, categories[ findings, recommendations ]}
   ─▶ stored as ComplianceScanResult ─▶ rendered (score %, issues, PDF report)
```

**B) Per‑matter File Review**
```
File Review page ─▶ list 102 synced matters
   ─▶ "AI Review" on a matter
        ─▶ POST /api/ai/review-matter
             ─▶ review_matter(matter, related CDD/conflicts/undertakings) ─▶ OpenAI
        ◀─ findings + regulatory references + risk rating
```

> All AI calls funnel through one function `services/ai_analysis.py::_call_ai()`.
> Provider is selectable: **openai** (current) / anthropic / **n8n** (see §8).

---

## 6. Scheduled automation (Celery beat)

```
Celery beat (cron) ─▶ Redis queue ─▶ Celery worker runs jobs:
   • 06:30 daily   run_daily_compliance_scan
   • 06:45 daily   check_reconciliation_overdue   (SRA Rule 8.3)
   • 07:30 daily   check_training_due
   • 07:45 daily   check_upcoming_deadlines
   • 08:15 daily   check_undertaking_expiry
   • hourly        check_breach_ico_deadlines      (ICO 72‑hour window)
   • Sun 02:00     reassess_aml_risk
```

---

## 7. Deployment topology

```
LOCAL  (docker-compose.yml + docker-compose.local.yml)
   web :3000   api :8000   db   redis   celery   (no Caddy)
   → http://localhost:3000

LIVE   (VPS 69.62.110.2 = app.seemaai.co.uk, /opt/seema)
   Caddy :80/:443 ─▶ web :3000 (/) + api :8000 (/api)
   db · redis · celery-worker · celery-beat
   (n8n runs as a SEPARATE container at n8n.seemaai.co.uk)
   Deploy = scp changed files to /opt/seema  →  docker compose up -d --build
```

---

## 8. Optional: n8n AI gateway + PII redaction (off by default)

```
AI_REDACT_PII=true  ─▶ tokenise emails/phones/postcodes + client names BEFORE the LLM call
AI_PROVIDER=n8n     ─▶ _call_ai() POSTs the (redacted) prompt to
                       https://n8n.seemaai.co.uk/webhook/seema-ai  instead of OpenAI direct
                       ─▶ n8n → LLM ─▶ Seema re‑identifies tokens in the reply
```
Plumbing is ready (`services/pii_redaction.py`, `deploy/n8n/seema-ai-gateway.json`); currently the
app calls OpenAI directly with redaction OFF.

---

## 9. Current demo state (2026‑06‑16)

- **Live:** app.seemaai.co.uk — login `demo@seemaai.co.uk` / `Demo1234!`
- **Synced:** 102 Clio matters + contacts + staff for the demo firm.
- **Working pages:** Dashboard (102 open matters, 2 staff) · File Review (matters + AI Review) ·
  Compliance Scan (AI score + findings + PDF).
- **Empty (Seema‑native, not from Clio):** AML/CDD · Conflicts · Undertakings — populated by using
  those features in‑app, not by the Clio sync.
```
Flow being demoed:   Clio data ─▶ Seema sync ─▶ AI processes ─▶ COLP sees it on the dashboard
```
