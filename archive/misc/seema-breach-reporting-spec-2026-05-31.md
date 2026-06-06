# Seema Breach Register & SRA Reporting — Product Spec

**For:** Seema engineering  •  **Author:** Omar  •  **Date:** 31 May 2026  •  **Status:** Draft for build kickoff

---

## 0. Why we're doing this and why we're NOT replacing ICO

Today `/breaches` handles ICO 72-hour data-breach notifications well. The instinct to "change it to SRA reporting" is the wrong frame and would create a regulatory gap. Here is the correct design:

A breach is a single real-world event. That event can produce **zero, one, or multiple regulatory reporting obligations**, depending on its facts:

| Event | ICO obligation? | SRA obligation? |
|---|---|---|
| Email with client medical records sent to wrong recipient | Yes — UK GDPR Art 33 (72h to ICO) | Yes — Code for Firms 3.9 (loss of confidentiality, prompt SRA report) |
| Trainee accidentally photographed a client matter file at home | Yes (if data lost or exposed) — UK GDPR Art 33 | Possibly — depends on severity |
| Solicitor takes £20,000 from client account without authorisation | No (not a personal data breach) | Yes — Accounts Rules + Code 3.9 (financial misconduct, mandatory SRA report) |
| Conveyancing matter run without CDD on the client | Possibly (if linked to data issues) | Possibly — depends on systemic vs. one-off |
| Two minor failures to log file reviews in a quarter | No | No — minor breach, log internally only |
| Fee-earner returns from suspension and continues to bill without authorisation | No | Yes — serious |

The product needs to model breaches as **events with multiple reporting tracks**, not as ICO-vs-SRA. This spec defines that data model and the workflows around it.

This spec also assumes Clio is the firm's primary PMS and Seema reads Clio data to (a) auto-detect possible breaches and (b) populate evidence in SRA reports. The Clio OAuth integration is already wired (see SESSION_HANDOFF dated 2026-05-26) — this builds on that.

---

## 1. Regulatory grounding

Build this whole feature with the citations visible in the UI. Users need to see *why* something is a breach, not just *that* it is. Source these citations from the SRA's published guidance and link out where relevant.

### Serious breach reporting — SRA

**SRA Code of Conduct for Firms, paragraph 3.9:**
> You report promptly to the SRA, or another approved regulator as appropriate, any facts or matters that you reasonably believe should be brought to its attention in order that it may investigate whether a serious breach of its regulatory arrangements has occurred or otherwise exercise its regulatory powers.

**SRA Code of Conduct for Solicitors, RELs and RFLs, paragraph 7.7:** equivalent personal duty on individuals.

**Definition of "serious breach"** — there is no closed definition. The SRA's published guidance ("Reporting and notification obligations", current version) lists indicators. Build the classifier around these indicators. Key categories:

- Involves or suggests dishonesty
- Sexual misconduct, violence, or discrimination
- Serious financial misuse — particularly client account
- Risk of harm to clients, the public, or the administration of justice
- Persistent, repeated, or systemic behaviour
- Misleading or attempting to mislead the SRA, the court, or clients
- Loss of confidential client information (overlaps with UK GDPR)
- Significant breaches of the SRA Accounts Rules
- Failure of risk-management systems and controls (AML, undertakings, supervision)
- Insolvency-related events
- Criminal convictions, charges, or cautions

**"Promptly"** — the SRA does not define a number. Internal SLA convention in firms is typically 14 days. Build the timer as advisory (configurable per firm, default 14 days) and surface SRA guidance text next to it.

### Minor breach logging — implicit obligation

There is no explicit SRA rule that says "log minor breaches." But:

- **SRA Code for Firms 2.1** requires "effective systems and controls" — internal breach logging is one of those controls.
- **SRA AML thematic review (2023)** explicitly criticised firms for failing to maintain internal breach logs that would have caught patterns.
- **COLP duty under SRA Authorisation Rules** — the COLP must take all reasonable steps to ensure compliance. An internal log is the evidence those steps were taken.
- **Inspector practice** — when the SRA visits, the first request is usually for the breach log. A firm with no log is presumed not to be looking.

So minor breaches need a first-class logging workflow even though there is no statutory deadline.

### Data breaches — UK GDPR / DPA 2018

**UK GDPR Article 33(1):** notify the ICO without undue delay and where feasible within 72 hours of becoming aware of a personal data breach.

**UK GDPR Article 34:** notify affected data subjects when the breach is likely to result in a high risk to their rights and freedoms.

This is what the current `/breaches` page already handles. Keep it. The new design wraps the existing ICO workflow inside the broader Breach Register.

---

## 2. User personas — who uses this

**COLP (Compliance Officer for Legal Practice)** — primary user. Sarah Mitchell in the demo tenant. Receives every triage card, makes the call on Serious vs Minor, signs off SRA reports, owns the audit trail. Will live on this page for an hour a day during normal operations and a full day when a serious breach happens.

**COFA (Compliance Officer for Finance and Administration)** — James O'Brien in the demo. Same access for finance-related breaches (Accounts Rules, client money). Often the same person as the COLP at small firms.

**Fee-earner (solicitor, paralegal, partner)** — secondary user. Reports breaches they discover. Receives "your action is required" tasks from triage cards.

**Practice Manager / Risk Partner** — read-only, period reports, trend dashboards.

**SRA Inspector (out-of-band)** — never logs in but the export pack must satisfy them. The "SRA Visit Pack" output from `/sra-audit` should pull from this module.

---

## 3. UX walkthrough — what each screen looks like

There are six screens. Walk a developer through these in order.

### Screen A — Breach Register (replaces current `/breaches`)

The main list view. What the COLP sees first when they click "Breaches" in the nav.

**Header strip — six KPI cards:**

- Open Breaches (any status that isn't Closed)
- Pending Triage (auto-detected events awaiting COLP decision)
- Reportable to SRA — open (Serious, not yet reported)
- Reportable to ICO — open (countdown showing tightest 72h window)
- Reported this Year (cumulative count)
- Avg Time to Report (ICO + SRA tracks, separate numbers)

**Alert strip — only renders if any countdown is < 24h:**

A pinned warning card like the existing `/breaches` ICO 72-hour notification card. Same UX. Now it can show *either* an ICO countdown *or* an SRA "promptly" advisory countdown, or both stacked.

**Tabs across the top:**

- All
- Pending Triage *(default — this is where COLP starts each day)*
- Serious (SRA-reportable)
- Minor (logged only)
- Data (ICO-reportable)
- Reported (already submitted to a regulator)
- Closed

**Table columns:**

| Col | Source | Notes |
|---|---|---|
| Ref | `BR-2026-NNNN` | Auto-incremented per firm per year |
| Detected | timestamp | Read-only after creation |
| Source | enum | Manual / Compliance Scan / Clio Rule / Complaint / Alert / External |
| Summary | text | One-line description (AI suggests, COLP edits) |
| Affected | client/matter | Linked Clio matter ID + client name where relevant |
| Categories | tag list | Data Protection, Client Money, Confidentiality, AML, Conflict, Supervision, Undertaking, Equality, Other |
| Severity | enum | Pending Triage / Minor / Serious / Resolved no-breach |
| Reporting Tracks | badge list | ICO, SRA, Both, None (each badge shows status: Required, Drafted, Submitted, N/A) |
| Status | enum | Pending Triage → Investigating → Reported → Closed |
| Owner | user | COLP by default for Serious, fee-earner for Minor |
| Days Open | computed | RAG-coloured (green ≤7, amber ≤21, red >21) |

**Filters:** source, category, fee-earner, matter, severity, reporting track, date range.

**Bulk actions:** Export breach log (PDF + CSV), Generate COLP Review Pack (for monthly review), Archive closed > 6 years (SRA retention).

**Empty state:** "No breaches in this view. This is a good thing. The SRA will still want to see a breach log though — keep logging minor issues here to show the system is working."

### Screen B — Pending Triage (auto-detected from Clio)

A specialised list, distinct from the main Register. Each row is a **candidate event** flagged by a rule running over Clio data. It is NOT yet a breach. The COLP triages each card.

Each card shows:

- Rule that fired (e.g. "Trust line item created without matching transfer within 1 working day — Accounts Rule 3.1")
- Clio reference (matter ref, client, fee-earner, timestamp)
- Evidence — a Clio data snapshot at moment of detection (hashed for audit trail)
- AI suggestion — "This looks like a possible Accounts Rules breach (serious). Consider checking [X]."
- Three buttons:
  - **Not a breach** — closes the card, records reasoning, no breach record created
  - **Minor — log only** — creates a breach record at Minor severity, goes to log
  - **Serious — open investigation** — creates a breach record at Serious severity, opens Screen D

Each triage decision is logged with COLP name, timestamp, reasoning. This audit trail is what the SRA wants to see — that the firm *triages* events systematically.

If a card sits in Pending Triage for > 48 hours, escalate to "Daily Briefing" digest sent to COLP at 08:00 (re-use the existing supervision-reminder digest).

### Screen C — Log a Breach (manual entry)

A form fee-earners or the COLP use to log a breach they discovered manually.

**Step 1 — What happened:**

- Free-text "Describe what happened" (AI-assisted classifier reads this and suggests categories)
- Date/time discovered
- Date/time of underlying event (may be earlier)
- Detected by — who, role
- Affected client / matter (Clio searchable picker)
- Affected data subjects (count + categories — read by ICO classifier)

**Step 2 — Categorise:**

AI proposes categories from the description. COLP confirms or edits. Pick one or more from: Data Protection, Client Money, Confidentiality, AML, Conflict, Supervision, Undertaking, Equality, Discrimination, Dishonesty, Other.

**Step 3 — Reporting track suggestion (decision support, not automation):**

The system presents:

- *"Does this involve personal data of an identifiable individual that has been lost, exposed, or wrongly disclosed?"* → if yes, ICO track activated; 72h countdown starts.
- *"Does this meet any of the SRA's published serious-breach indicators? [list of 11 indicators with checkboxes]"* → if any ticked, SRA Serious track activated; advisory 14-day countdown.
- Otherwise → suggest Minor — log only.

The COLP sees the SRA guidance text next to each indicator. **Final call is always the COLP's.** The system records that the COLP saw the indicators and the call they made.

**Step 4 — Initial containment:**

Free-text: "What has been done immediately to contain or mitigate?" This is what the SRA will want to see first when a report lands.

**Step 5 — Save:**

Saved as Draft until Step 6 below.

### Screen D — Serious Breach Investigation Workflow

Triggered when severity = Serious. A multi-stage investigation packet that builds the SRA report incrementally.

**Stage 1 — Facts (auto-populated from Step 1–3):** editable.

**Stage 2 — Impact assessment:**

- Number of clients affected
- Financial impact (£)
- Categories of harm (financial, confidentiality, fairness, public confidence)
- Whether the matter is ongoing or resolved
- Whether other regulators are also involved (ICO, FCA, NCA, HMRC)

**Stage 3 — Immediate actions taken:**

Free-text + linked remediation plan (creates a row in `/remediation` automatically).

**Stage 4 — Root cause analysis:**

- Was this a one-off or systemic?
- Was a control bypassed or absent?
- Has it happened before? (system surfaces similar past breaches from log)

**Stage 5 — Draft SRA report:**

AI-generates a draft report using a template that follows the SRA's published expectations. The template covers: firm details, COLP/COFA details, breach summary, factual chronology, regulatory provisions engaged, impact, immediate actions, remediation, retention of records.

**The AI is decision-support, not autonomous.** The draft is generated, the COLP edits, sign-off is required before any further step.

**Stage 6 — Internal review and sign-off:**

- Optional: forward to insurance broker (PII notification trigger — SIIR requires notification of circumstances)
- Optional: forward to firm's external compliance advisor
- COLP electronic sign-off (named, timestamped, IP-logged)

**Stage 7 — Submission to SRA:**

The SRA does not have a public report-submission API. Submission is one of:

- Email to `report@sra.org.uk`
- mySRA portal upload (manual)
- Post (rarely)

The system generates the report as PDF, sends via the firm's outbound email (with COLP cc'd), and records submission timestamp, method, recipient address, and a hash of the submitted PDF for evidence.

**Stage 8 — Track SRA response:**

When the SRA acknowledges, COLP enters the SRA reference number. From then on, all correspondence is logged against the breach record. Status changes to Reported.

**Stage 9 — Close:**

When the SRA closes (no further action, or completed enforcement), COLP closes the breach record with outcome notes. Breach stays in the log for 6+ years per SRA retention expectations.

### Screen E — Minor Breach Log Entry

Simpler form than D. No SRA report. Captures:

- What happened
- Categories
- Root cause (drop-down: human error, system gap, training gap, third-party failure, deliberate non-compliance, other)
- Action taken to prevent recurrence
- Closed-by, closed-at

Goes straight to the log. Visible in the COLP Trend Dashboard.

### Screen F — COLP Trend Dashboard

A quarterly / monthly view the COLP uses for oversight. Charts:

- Breach count over time (12 months rolling), stacked by category
- Repeat patterns flagged — "3 minor breaches in the same category in 90 days → review whether this aggregates to a systemic serious breach (SRA Code 3.9)"
- Heatmap by fee-earner — minor breach concentrations (NOT for blame, for training-need identification)
- Heatmap by matter type — where compliance is breaking down
- Time-to-report distribution (ICO and SRA, separate)
- Outstanding remediation plans linked to breaches

**Generate COLP Quarterly Review Pack** button — produces a PDF with all the above plus narrative summary, ready to file as evidence the COLP is doing the job. This is the artefact an SRA inspector asks for first.

---

## 4. Data model

PostgreSQL schema additions. Names assume the existing Seema convention (Prisma on Node side, SQLAlchemy on Python side — keep names identical across both ORMs).

```
Breach
  id (PK)
  firm_id (FK, RLS-protected — see SESSION_HANDOFF re: tx-bypass GUC)
  ref (unique per firm per year: BR-2026-NNNN)
  detected_at (timestamp)
  event_occurred_at (timestamp, nullable, ≤ detected_at)
  detected_by_user_id (FK)
  source (enum: manual, compliance_scan, clio_rule, complaint, alert, external)
  source_ref (string, nullable — e.g. triage card ID, scan run ID, complaint ID)
  summary (text, max 280)
  full_description (text)
  affected_client_id (FK to firm contact)
  affected_matter_id (FK to firm matter — may be a Clio matter ID mirror)
  affected_subject_count (int, nullable)
  categories (text[])
  severity (enum: pending_triage, minor, serious, not_a_breach, resolved)
  severity_decided_by_user_id (FK, nullable)
  severity_decided_at (timestamp, nullable)
  severity_reasoning (text — required when serious or not_a_breach)
  status (enum: pending_triage, investigating, reported, closed)
  owner_user_id (FK)
  closed_at (timestamp, nullable)
  closure_outcome (text, nullable)
  created_at, updated_at

BreachReportingTrack
  id (PK)
  breach_id (FK)
  regulator (enum: ico, sra, fca, nca, hmrc, lso, other)
  required (bool — system's decision-support output)
  required_reasoning (text)
  deadline_at (timestamp, nullable — ICO 72h, SRA 14d advisory)
  draft_content (text)
  approved_by_user_id (FK, nullable)
  approved_at (timestamp, nullable)
  submitted_at (timestamp, nullable)
  submission_method (enum: email, portal, post, api, not_submitted)
  submission_recipient (string, nullable)
  submission_pdf_hash (string, nullable — SHA-256 of the submitted PDF)
  regulator_reference (string, nullable)
  regulator_response (text, nullable)
  closed_at (timestamp, nullable)

BreachEvidence
  id (PK)
  breach_id (FK)
  type (enum: clio_data_snapshot, document, email, scan_finding, communication, manual_note)
  captured_at (timestamp)
  content (jsonb — for snapshots) OR content_ref (FK/URL — for docs)
  content_hash (string — SHA-256, used to prove evidence wasn't tampered)
  source_system (enum: clio, seema, manual, external)

BreachAction
  id (PK)
  breach_id (FK)
  type (enum: containment, remediation, training, policy_update, communication)
  description (text)
  assigned_to_user_id (FK)
  due_at (timestamp, nullable)
  completed_at (timestamp, nullable)
  remediation_plan_id (FK to existing /remediation, nullable)

BreachAuditLog
  id (PK)
  breach_id (FK)
  actor_user_id (FK)
  actor_role (string)
  action (enum: created, viewed, severity_changed, track_added, draft_edited, draft_approved, submitted, response_recorded, closed, reopened)
  before (jsonb, nullable)
  after (jsonb, nullable)
  ip_address (string)
  user_agent (string)
  timestamp (timestamp)

BreachRule
  id (PK)
  firm_id (FK — rules are firm-scoped, allowing per-firm tuning)
  name (string)
  description (text)
  category (string — matches Breach.categories)
  source_kind (enum: clio_webhook, clio_poll, seema_internal, scheduled)
  source_config (jsonb — endpoint, filters, schedule)
  condition_jsonb (jsonb — see Section 5 for the DSL)
  default_severity_suggestion (enum: minor, serious — never auto-decides, only suggests)
  enabled (bool)
  created_by_user_id (FK)
  last_fired_at (timestamp, nullable)
  fire_count (int)

BreachTriageCard
  id (PK)
  firm_id (FK)
  rule_id (FK)
  fired_at (timestamp)
  evidence_jsonb (jsonb)
  ai_suggestion (text)
  status (enum: pending, dismissed, converted_to_minor, converted_to_serious)
  decided_by_user_id (FK, nullable)
  decided_at (timestamp, nullable)
  decision_reasoning (text)
  resulting_breach_id (FK, nullable)
```

A few critical notes for the developer:

- All Breach writes happen inside Prisma interactive transactions (per the audit trail requirement). **The RLS GUC bypass bug** documented in SESSION_HANDOFF *applies here* — every transaction must start with `tx.$executeRawUnsafe("SELECT set_config('app.current_firm_id', '${firmId}', true)")`. Do not skip this. There is one wrong implementation in `dataManagement.ts:156` already in the codebase (per handoff ticket #26) — do not copy that pattern.
- `BreachEvidence.content_hash` is non-optional for `clio_data_snapshot` type — without it, the evidence can be claimed tampered, defeating the audit purpose.
- `BreachAuditLog` is append-only. No update or delete endpoint. Enforce at DB level (`REVOKE UPDATE, DELETE`).
- Retention: SRA expects firms to keep breach records for at least 6 years. Apply this as a `closed_at + 6 years` archive policy, not a delete policy.

---

## 5. Clio integration — what we read and what triggers a triage card

Seema cannot tell whether a breach has occurred by reading Clio data alone — Clio doesn't tag breaches. What we can do is run **rules** over Clio data that detect *patterns that often correlate with breaches*, and surface those to the COLP as triage cards.

Architecture:

1. Clio fires a webhook (or our scheduled poller runs).
2. Seema's rule engine evaluates the event against the firm's enabled `BreachRule`s.
3. Matched rules create `BreachTriageCard` rows.
4. COLP sees them in Screen B and decides.

Below are the rules to ship in v1. Each lists the Clio endpoint or webhook, the condition, and the suggested severity.

### Rule 1 — Late client money handling (Accounts Rule 3.1)

- **Trigger:** Clio webhook `trust_line_item.created` (deposit received), OR daily poll `GET /api/v4/trust_line_items?date>=yesterday`
- **Condition:** Deposit received but no corresponding ledger transfer / clearance activity within 1 working day
- **Evidence:** snapshot of trust line item, related matter, fee-earner
- **Suggestion:** Serious
- **Citation:** SRA Accounts Rules 3.1 (client money paid into client account promptly)

### Rule 2 — Bill issued before CDD verified

- **Trigger:** Clio webhook `bill.created`
- **Condition:** Bill's matter has client whose Seema CDD status ≠ Verified, OR client has no CDD record
- **Evidence:** bill ID, client, CDD status snapshot
- **Suggestion:** Minor (could become Serious if pattern persists)
- **Citation:** MLR 2017 Reg 28 (CDD before establishing business relationship)

### Rule 3 — Matter opened without conflict check

- **Trigger:** Clio webhook `matter.created`
- **Condition:** New matter has no Seema conflict-check record dated within 7 days before `matter.created_at` for that client
- **Evidence:** matter, client, last conflict check date
- **Suggestion:** Minor
- **Citation:** SRA Code for Solicitors 6.2

### Rule 4 — Outbound email to unrecognised recipient (potential confidentiality breach)

- **Trigger:** Clio webhook `communication.created` where `type=email`, `direction=outbound`
- **Condition:** Recipient email domain not in matter's party register *and* not in firm-wide whitelist (e.g. courts, regulators)
- **Evidence:** email subject (NOT body — privacy), recipient, matter, sender
- **Suggestion:** Minor *(could become Serious if recipient is clearly wrong party)*
- **Citation:** UK GDPR Art 5(1)(f) integrity & confidentiality + SRA Code for Solicitors 6.3 (duty of confidentiality)
- **Note:** This rule will be noisy. Default it OFF, let firms opt in after tuning their whitelist.

### Rule 5 — Junior staff time entries without supervisor follow-up

- **Trigger:** Scheduled — weekly Sunday 23:00 firm-time
- **Source:** `GET /api/v4/activities?date>=4_weeks_ago` joined to `GET /api/v4/users` (filter role=trainee, junior, paralegal)
- **Condition:** Matter worked on by junior staff with no supervisor time entry or note logged in last 30 days
- **Evidence:** matter, junior staff, supervisor relationship from `/supervision`
- **Suggestion:** Minor
- **Citation:** SRA Code for Firms Rule 3 (supervision arrangements)

### Rule 6 — Overdue undertaking past advisory grace

- **Trigger:** Scheduled — daily 00:30 firm-time
- **Source:** Seema's own `/undertakings` table (Clio doesn't have native undertakings)
- **Condition:** Undertaking status=Outstanding AND due_date > 24h ago
- **Evidence:** undertaking, matter, given-to / received-from party
- **Suggestion:** Serious if Risk Level=High or repeated; Minor otherwise
- **Citation:** SRA Code for Solicitors 1.3

### Rule 7 — Client account balance left unreconciled beyond Accounts Rules cadence

- **Trigger:** Scheduled — monthly on 6th calendar day (Accounts Rules require 5-week reconciliation)
- **Source:** `GET /api/v4/bank_transactions` and `GET /api/v4/trust_line_items`
- **Condition:** No reconciliation marker for previous calendar month
- **Evidence:** date of last reconciliation, current balance discrepancy if any
- **Suggestion:** Serious
- **Citation:** SRA Accounts Rule 8.3

### Rule 8 — Sanctions list match against existing client (OFSI)

- **Trigger:** Daily — re-run OFSI list against Clio contacts
- **Source:** `GET /api/v4/contacts` + OFSI consolidated list (fetched daily from OFSI feed)
- **Condition:** Name match (fuzzy, configurable threshold) against OFSI designated person
- **Evidence:** contact record, OFSI entry, match score
- **Suggestion:** Serious (also triggers OFSI reporting obligation — separate track)
- **Citation:** Sanctions and Anti-Money Laundering Act 2018; MLR 2017 Reg 33

### Rule 9 — Document storage outside permitted location

- **Trigger:** Clio webhook `document.created` (if available; otherwise hourly poll)
- **Condition:** Document stored to a matter folder by a user who lacks permission for that practice area
- **Evidence:** document ID, user, matter, permission state
- **Suggestion:** Minor
- **Citation:** UK GDPR Art 32 (security of processing); SRA Code for Firms 2.1

### Rule 10 — Matter closed without final compliance checklist completed

- **Trigger:** Clio webhook `matter.updated` where `status` transitions to `closed`
- **Condition:** Linked Seema matter-compliance checklist has open items
- **Evidence:** matter, checklist state at close
- **Suggestion:** Minor
- **Citation:** SRA Code for Firms 2.1 (effective systems and controls)

### Rule DSL

Rules are stored as JSON for non-developer authoring later. v1 ships hard-coded rules in code with a `BreachRule` row per firm referencing the rule key. v2 adds a no-code rule editor.

```jsonc
// Example rule condition for Rule 1
{
  "all": [
    { "fact": "trust_line_item.type", "op": "eq", "value": "deposit" },
    {
      "not": {
        "exists": {
          "fact": "trust_line_item.matched_clearance",
          "within_hours": 24,
          "exclude_weekend": true
        }
      }
    }
  ]
}
```

### Clio API operational notes

- **Auth** — re-use the OAuth token plumbing from the existing Clio integration. Both Node and FastAPI have token refresh code (handoff ticket #25 flagged a race condition here — fix that *before* shipping this feature, or breach detection will silently fail on token refresh).
- **Rate limit** — Clio caps at 200 req/min per app. Rule 7 (monthly reconciliation) is bulky; use the `fields` parameter to slim responses.
- **Webhooks** — register at `https://app.seemaai.co.uk/api/integrations/clio/webhooks/breach-detector`. Verify Clio's signature header before processing (HMAC SHA-256 with the webhook secret). Idempotent on Clio's event ID.
- **EU pod** — base URL `https://eu.app.clio.com`, *not* the US default. Already corrected in `seema-api/services/clio.py` per handoff but the integration tests don't yet cover the EU pod path — add them as part of this feature.
- **Backoff** — implement exponential backoff on 429 with jitter. Do *not* drop events on backoff; queue to Redis with retry.
- **Evidence retention** — every Clio API response that produces evidence is stored as `BreachEvidence.content` with `content_hash` set. Do not store full Clio responses for *every* webhook — only for ones that produce triage cards. Otherwise the storage and privacy footprint balloons.

---

## 6. SRA Serious-Breach classifier — decision support, not automation

This is the highest-stakes piece in the spec. Get it wrong and the firm either under-reports (regulatory exposure) or over-reports (looks like a basket case). The classifier's role is **decision support**:

- It surfaces the SRA's 11 published indicators (from Section 1) as a checklist alongside the breach.
- For each indicator, it shows whether the system thinks it applies (with the data points that led to that view).
- The COLP ticks or unticks each indicator and writes reasoning.
- The system then says "Based on N indicators ticked, the SRA's guidance suggests this is likely a serious breach." It does not auto-decide.
- The COLP makes the call. The call is logged with named-COLP + reasoning + timestamp.

**Hard rules:**

- Never auto-classify a breach as Serious.
- Never auto-submit a report to the SRA.
- Always show the SRA guidance text in-page, with date of the guidance version.
- Always require COLP sign-off (named, electronic) before any draft report is submitted.
- Always store the indicators the COLP saw at the moment of decision — guidance changes; the firm needs to be able to show what they were looking at.

For AI-assisted draft generation: the model gets the structured facts (Stages 1–4 of Screen D) and produces a draft against the SRA report template. Always show "AI-drafted — review and edit before submission" banner. Log the model version used for each draft.

---

## 7. Output: the SRA report itself

The report PDF must include, in order:

1. Firm name, SRA number, address, COLP name & SRA number, COFA name & SRA number
2. Submitting individual (COLP or other) — name, role, SRA number
3. Date of report; date of detection; date of underlying event
4. Summary (1 paragraph)
5. Factual chronology — bullet list of events with dates
6. Regulatory provisions engaged — cited
7. Persons affected — clients, employees, third parties (anonymised where appropriate)
8. Financial impact and any client money implications
9. Immediate containment and mitigation
10. Root cause analysis
11. Remediation plan with deadlines and owners
12. Whether other regulators have been or will be notified (ICO, NCA, FCA, HMRC, Legal Ombudsman, PII insurer)
13. Internal records retention statement
14. Sign-off block — COLP signature, date, IP address, hash of submitted PDF

A copy of every submitted report is stored against the breach record. The hash of the PDF is recorded so the firm can prove later what was submitted.

---

## 8. Audit, evidence, retention

- Every action on a breach record writes a `BreachAuditLog` row. No exceptions.
- Audit log is append-only at DB level.
- Retention — 6 years minimum from `closed_at`. Configurable per firm; default 7 to be safe.
- Export — the COLP can produce a tamper-evident export (ZIP of breach data + audit log + evidence files + hash manifest) for an SRA visit. This feeds into the existing `/sra-audit` "Generate SRA Visit Pack" output.

---

## 9. Migration from current `/breaches`

The existing `/breaches` table has data breach records under the ICO frame. Migration:

1. Create new tables alongside existing ones.
2. Backfill existing breach rows into the new `Breach` table with `severity=serious` if `type=data` and `severity=Critical|High`, else `severity=minor`. Reporting track: ICO required if data type. Source: `external` for backfilled rows.
3. Existing 72-hour countdowns continue to work — they become an ICO `BreachReportingTrack` row with `deadline_at` populated.
4. Old `/breaches` URL redirects to new `/breach-register`. Or keep `/breaches` as a friendly URL alias.
5. Existing notifications/reminders are re-wired to operate on the new table.

Roll forward only — no roll-back path. Take a DB dump before migration.

---

## 10. Sequencing — what to build first

If we have to ship this in phases, here is the brutal-honesty sequence:

**Phase 1 (3–4 weeks)** — the table-stakes that unlocks everything:

- Data model + migrations + RLS-correct repositories
- Screen A (Breach Register listing) and Screen E (Minor breach log entry)
- Backfill from existing `/breaches`
- Audit log infrastructure

Without phase 1, every other phase is unsafe to build.

**Phase 2 (3–4 weeks)** — the SRA value:

- Screen C (Log a Breach) with SRA decision-support classifier
- Screen D (Serious workflow) Stages 1–4 + 7 (manual submission, no AI draft yet)
- Citation library in UI

After phase 2, the product is genuinely better than today and can be demo'd as "SRA-native breach reporting."

**Phase 3 (4–5 weeks)** — the Clio differentiator:

- BreachRule engine + Rules 1, 2, 3, 7 (the four highest-value low-noise rules)
- Screen B (Pending Triage)
- Webhook receiver + signature verification + idempotency

After phase 3, the loop closes: Clio data → triage → breach record → SRA report.

**Phase 4 (3–4 weeks)** — the AI draft, the trend dashboard, the remaining rules:

- Screen D Stages 5 & 6 (AI draft + insurer notification)
- Screen F (Trend Dashboard)
- Rules 4–10
- COLP Quarterly Review Pack output

**Phase 5 (ongoing)** — tune the classifier, add per-firm rule authoring, add the no-code rule editor for COLPs.

---

## 11. Open questions to decide before kickoff

The developers will ask, so decide now:

1. **Does Seema take legal responsibility for the SRA-reportable suggestion?** Spec assumes no — decision support only. Confirm with insurance/legal.
2. **Do we store full Clio API responses, or only the fields used for evidence?** Spec assumes only the fields used. Privacy + storage cost reasons.
3. **What happens when the firm disconnects Clio?** Triage rules stop running. Existing breach records stay. Decide: do we surface "Clio integration disconnected — breach detection paused" prominently? Spec assumes yes.
4. **Multi-jurisdiction firms (e.g. London + Scottish office)** — Scottish solicitors are regulated by the Law Society of Scotland, not the SRA. Out of scope for v1; revisit if firm has Scottish office.
5. **PII insurer notification** — solicitors' indemnity insurance requires notification of "circumstances which may give rise to a claim." A serious breach often triggers this. Spec assumes Stage 6 includes a "Notify PII broker" toggle. Need to model brokers per firm — separate small feature.
6. **What's the AI model for draft generation and classifier suggestion?** Spec doesn't specify. Most likely Claude (per existing Anthropic key in `.env`). Confirm.
7. **Is the COLP electronic signature legally sufficient for SRA submission?** SRA accepts email submission, so a typed signature in a PDF is fine. If your firm requires digital signatures (DocuSign etc.), that's a v2 add.

---

## 12. What this does NOT cover

So expectations are clear:

- It does not submit reports to the SRA automatically. No public API exists. Manual email/portal/post.
- It does not give legal advice on whether something IS a breach. It provides decision support against published SRA guidance.
- It does not replace insurance broker notification. It triggers a workflow; the broker conversation still happens outside Seema.
- It does not handle Legal Ombudsman complaints (those live in `/complaints`).
- It does not handle ICO reporting of breaches affecting individuals (Article 34). That's a separate workflow — v1.1.
- It does not back-source data from before Clio integration. Pre-integration breaches must be logged manually in Screen C.

---

End of spec. Estimated total build effort: 16–20 weeks for a 2-engineer team if Phase 1–4. Phase 5 is open-ended.
