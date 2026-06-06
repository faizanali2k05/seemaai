# Email to dev team — feature handoff

**To:** [dev team]
**From:** Omar
**Subject:** Two new SRA compliance features ready for build — Breach Register + Monthly Reconciliation

**Attachments (7 files):**
1. `seema-sra-audit-2026-05-31.md` — strategic audit that triggered both features
2. `seema-breach-reporting-spec-2026-05-31.md` — Breach Register spec
3. `seema-breach-register.html` — Breach Register UI prototype
4. `seema-breach-feature.zip` — Breach Register scaffolding code (15 files)
5. `seema-reconciliation-spec.md` — Monthly Reconciliation spec
6. `seema-reconciliation.html` — Monthly Reconciliation UI prototype
7. `seema-reconciliation-feature.zip` — Monthly Reconciliation scaffolding code (12 files)

---

Team,

Two new features are ready for build kickoff. Both are SRA-specific compliance work — exactly the wedge we identified in the product audit (see attachment 1).

## TL;DR

**Breach Register** replaces the current ICO-focused `/breaches` page. Handles serious breaches (full SRA report workflow under Code 3.9) and minor breaches (internal log). ICO/data-breach work becomes a packet handoff to the firm's nominated Data Protection partner — we don't file with the ICO, we hand off. COFA-COLP separation respected throughout.

**Monthly Reconciliation** is new — a `/reconciliation` page owned by the COFA. SRA Accounts Rule 8.3 three-way reconciliation (bank / cashbook / client ledger), conservative auto-match against Clio trust ledger data, exception resolution, aged-balance management under Rule 5.1, COFA electronic sign-off, 6-year retention under Rule 13.

Estimated effort: Breach Register 16–20 weeks for 2 engineers, Monthly Reconciliation 12–16 weeks for 2 engineers. Parallelisable.

## What to read in what order

Each attachment serves a different purpose. To onboard quickly:

For the **Breach Register**, open the HTML prototype first to see the UX (`seema-breach-register.html` — opens in any browser, click "Log new breach" in the top right). Then read the spec for the regulatory grounding and 8-phase workflow rationale (`seema-breach-reporting-spec-2026-05-31.md`). Then unzip the scaffolding and start with its README.

For **Monthly Reconciliation**, same order. Open `seema-reconciliation.html`, click "Run reconciliation" — the wizard opens mid-flow at Phase 4 so you can see realistic exception handling. Read `seema-reconciliation-spec.md` for the workflow. Unzip the scaffolding and start with its README.

The strategic audit (`seema-sra-audit-2026-05-31.md`) is optional but useful for understanding why these specific features over the alternatives.

## Product decisions baked in (don't re-litigate without me)

For the Breach Register:
- ICO track is partner-handoff only, never direct filing — the COLPs we interviewed all outsource ICO work
- SRA track is fully in-house with AI-drafted reports requiring COLP electronic sign-off
- Late-classification stays in COLP hands; the system never auto-classifies as Serious

For Monthly Reconciliation:
- Clio Manage trust accounting is the only cashbook source for v1 (firms on LEAP/ALB/Quill blocked until v2)
- Single-tier COFA workflow — no Cashier role until v2 (works for firms under ~25 fee-earners)
- Manual PDF + CSV upload only — no Open Banking until v2
- Conservative auto-match — exact reference + amount + date only
- Tiered late alerting: amber at 28 days, auto-breach record at 35 days

## Cross-feature wiring

The two features integrate at three points. None are optional — they make the features work as a system:

1. Monthly reconciliation Rule 7 violations (bank charges to client account) automatically create breach records in `/breaches` for COLP review. Implemented in `reconciliationService.resolveException()`.
2. Reconciliation overdue at 35 days creates a breach record automatically via the background job in `seema-node/services/lateReconciliationJob.ts`. Schedule this daily.
3. Aged-balance actions from reconciliation Phase 6 create rows in `/remediation`. Implemented in `reconciliationService.actionAgedBalance()`.

The breach feature's `breachService` is imported by the reconciliation service. Build order matters: deploy Breach Register first, then Reconciliation, otherwise the Reconciliation deploy fails on the import.

## What you must do before deploying either feature

These are outstanding from earlier work-in-progress and block both features:

1. **Rotate the leaked secrets.** JWT_SECRET_KEY, Anthropic API key, SendGrid API key, both Postgres passwords (`seema_app`, `seema_admin`), and the new Clio Client Secret all ended up in transcripts. None have been rotated. This must happen before any production deploy.
2. **Fix the nginx race condition.** nginx hard-depends on FastAPI resolving at startup. The Breach Register needs FastAPI for AI drafting. If FastAPI fails to boot (already happens — the email-validator crash loop was the last instance), nginx crash-loops and the whole UI dies. Fix is a `resolver 127.0.0.11;` directive in nginx.conf plus variable-based `proxy_pass`. Roughly 30 lines. Has been in the backlog for weeks.
3. **Fix the Clio token refresh race.** SESSION_HANDOFF ticket #25. Both features read heavily from Clio. The race causes silent failures mid-refresh.
4. **Verify the RLS GUC bypass pattern is consistent.** Both feature bundles use `lib/rlsTransaction.ts` to avoid the bug. The original broken pattern is still in `dataManagement.ts:156`. Don't copy it. Fix it as a separate ticket.

## Stubbed services you need to wire to real implementations

The scaffolding calls these. Point them at our actual services:

- `emailService.sendBreachReport(...)` and `sendHandoffPacket(...)` — Breach Register submission and ICO handoff
- `emailService.sendReconciliationFiled(...)` — managing partner notification after COFA sign-off
- `pdfService.generateBreachReportPdf(breachId)` — server-side PDF generation with hash for audit
- `pdfService.generateHandoffPacket(breachId)` — ICO partner packet
- `pdfService.generateReconciliationPack(reconciliationId)` — COFA sign-off PDF
- `storageService.uploadEvidence(...)` — bank statement PDF storage
- `remediationService.createRow(...)` — aged-balance remediation flow

## Open product questions for our next product call

Don't answer in code yet — these need product input:

1. When does the Cashier role come back? Firms above 25 fee-earners will struggle without it in Reconciliation. Same applies to Breach Register where the COLP currently does all classification.
2. Non-Clio firms — we have no v1 path on either feature. CSV cashbook upload is the v2 plan. Is that the priority after v1 ships, or are integrations to LEAP/ALB/Quill first?
3. Multi-currency client accounts (USD/EUR) — out of v1. Some firms hold these. Decide priority.
4. mySRA API — there isn't one for submission today (the `/sra-return` "Submit Return" button currently implies one). Either build the guided manual export workflow or get the API access from the SRA. Status?
5. The COLP electronic sign-off mechanism — sufficient for SRA submission (yes, SRA accepts email submission), but is it sufficient for firms with internal digital-signature policies (DocuSign etc.)? Decide whether v1.1 needs DocuSign integration.

Talk first thing Monday. Anything urgent, ping me before then.

Cheers,
Omar
