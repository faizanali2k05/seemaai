# Seema Monthly Reconciliation — Product Spec

**For:** Seema engineering · **Author:** Omar · **Date:** 31 May 2026 · **Status:** Draft for build kickoff

---

## 0. Product decisions locked

These five product decisions were made before this spec was written. Reopen them only with deliberation; they shape data model, integration scope, and addressable market.

1. **Clio Manage trust accounting is the only cashbook source** for v1. Firms on LEAP, ALB, Quill, Insight Legal cannot use the feature. v2 adds CSV cashbook upload as a fallback. v3 adds native integrations to the top UK legal accounting systems.
2. **Single-tier COFA workflow.** No new Cashier role in v1. COFA performs all phases including line-by-line matching. Acceptable for firms under ~25 fee-earners. v2 adds a Cashier role.
3. **Tiered late-reconciliation alerting.** Amber alert at 28 days from last sign-off (firm target). Auto-breach record created in `/breaches` at 35 days (SRA Rule 8.3 ceiling).
4. **Conservative auto-match.** Only exact reference + amount + date matches auto-clear. Anything fuzzy lands as an exception for COFA review.
5. **Aged balances reviewed every cycle** as Phase 6 of each reconciliation. No separate quarterly review surface in v1.

---

## 1. Regulatory grounding

Build the UI with these citations visible. They are also evidence the feature aligns to the regulator.

**SRA Accounts Rule 8.3 — Reconciliation:**

> You must, at intervals of not more than five weeks, reconcile the balance shown by the bank, building society or other deposit-taker statement with the amounts shown in your records.

The rule is **five weeks (35 days) maximum**, not monthly. Firms call it "monthly" out of habit but the rule is calendar-day based. Most SRA enforcement notices on reconciliation discipline cite firms going to 36-40 days, not catastrophic failures.

**SRA Accounts Rule 8.4** — variances must be investigated promptly. The rule does not define "promptly" but the SRA's published guidance and enforcement notices treat anything beyond the next reconciliation as a fail.

**SRA Accounts Rule 5.1 — Residual balances:**

> You must promptly return funds to the client (or third party for whom the funds are held) as soon as there is no longer any proper reason to retain those funds.

This is the aged-balance rule. Firms accumulate small residuals from completed matters; the SRA inspects against this rule routinely. The 2023 thematic review specifically called out firms with residuals over 12 months old.

**SRA Accounts Rule 7 — Client account interest and bank charges.** Charges debited from the client account are an automatic Rule 7 issue requiring reimbursement and potentially a breach record.

**SRA Accounts Rule 13 — Records:**

> You must keep and maintain accurate, contemporaneous and chronological records relating to all dealings with client money for at least six years from the date of the last entry.

This drives the 6-year retention clock on every reconciliation pack.

**SRA Authorisation Rules — COFA duties.** The COFA is personally accountable for client account compliance. Reconciliation sign-off is the COFA's most visible regulatory artefact.

---

## 2. User personas

**COFA (Compliance Officer for Finance and Administration).** Primary user. James O'Brien in the demo tenant. Sole user of the reconciliation feature in v1's single-tier model. Lives on this page 1-2 days a month for the actual reconciliation, plus spot checks weekly.

**Managing partners.** Read-only. Receive email briefing when reconciliation is filed. Care about the totals and any breach implications.

**COLP (Compliance Officer for Legal Practice).** Read-only on reconciliation. Becomes involved only when a breach is auto-created at the 35-day mark or when the COFA escalates a Rule 7 issue from exceptions.

**SRA inspector (out-of-band).** Never logs in but the "Generate inspection pack" button at the top of the page must produce a clean PDF + working papers ZIP suitable for handing over.

---

## 3. End-to-end workflow — the 8 phases

Each phase has critical fields, state transitions, and downstream effects. Build them as a single multi-step wizard like the breach register. Auto-save between phases. Allow Save Draft & Close.

### Phase 1 — Period & scope

**Inputs:** period start date (default: first day of last calendar month), period end date (default: last day of last calendar month), accounts in scope (multi-select from firm's `BankAccount` table, filtered to client accounts only).

**Posting completeness check** runs against Clio:
```
GET /api/v4/trust_line_items?account_id=X&from=period_start&to=period_end&unposted=true
```
If any unposted entries, surface them with deep links to Clio and block continuation until COFA acknowledges.

**Output:** `Reconciliation` row created with status `period_set`. Children `ReconciliationAccount` rows created — one per in-scope account.

### Phase 2 — Statement upload

**Per account:**
- PDF statement: stored as binary, SHA-256 hashed, retained for evidence
- CSV statement: parsed into `ReconciliationStatement` lines (date, description, reference, amount, balance)
- Statement closing balance extracted from PDF or entered manually

**Validation:**
- PDF and CSV both required (blocking; we don't OCR PDFs in v1)
- Statement period dates must match Phase 1 period
- Closing balance must be entered

**Output:** `ReconciliationStatement` row per account with parsed bank lines. Status → `statements_uploaded`.

### Phase 3 — Auto-match

**Engine (deterministic, no AI in v1):**

For each bank line, find a Clio cashbook entry where:
- `reference` matches exactly (case-insensitive, whitespace trimmed)
- `amount` matches to the penny
- `date` within ±1 day

If a single match exists → mark as matched (record both line IDs in a `match_pair`).
If multiple candidates or no exact match → leave unmatched, surface in Phase 4.

**Output:** match rate per account, list of matched pairs, list of bank-side unmatched, list of cashbook-side unmatched. Status → `matching_complete`.

### Phase 4 — Exception resolution

**Per exception (each unmatched item on either side):**

Required fields:
- `reason` — fixed taxonomy:
  - `outstanding_lodgement` (cashbook in, not yet on bank — timing)
  - `unpresented_cheque` (cashbook out, not yet cleared — timing)
  - `bank_charge_to_office` (bank out, not in cashbook — needs posting + Rule 7 review)
  - `interest_credit` (bank in, not in cashbook — needs allocation)
  - `misallocated` (matched, but to wrong matter — correction needed)
  - `suspense_pending_id` (bank in, no client identified)
  - `bank_error` (bank query raised)
  - `posting_error` (cashbook error)
- `notes` — free text, audit trail
- `action_taken` — one of `cleared_as_timing`, `clio_correction_posted`, `escalated_to_breach`, `moved_to_suspense`, `bank_query_raised`

**Cross-feature integration:** `bank_charge_to_office` exceptions auto-flag for breach review. COFA decides whether to create a breach record from within this phase.

**Output:** all exceptions resolved with documented reasons. Adjustments calculated for Phase 5. Status → `exceptions_resolved`.

### Phase 5 — Three-way reconciliation statement

**Auto-generated. Three balances computed:**

```
Adjusted bank balance =
  bank statement closing balance
  + outstanding lodgements
  − unpresented cheques
  ± any other timing adjustments

Cashbook balance = sum of Clio cashbook entries to period end

Client ledger total = sum of individual matter client ledger balances
```

All three must equal. **Variance non-zero → COFA is blocked from sign-off (Phase 7).** The block is enforced by the route handler, not just the UI — see service layer below.

**Output:** `ReconciliationStatement` populated with the three balances and variance. Status → `three_way_complete` if variance zero, `variance_blocked` otherwise.

### Phase 6 — Aged balances review

**Surfaces:**
- Residual balances on completed matters (matter status closed, balance ≠ 0) aged >12 months
- Aged suspense items (>6 months in suspense)
- Aged unallocated receipts

**Per item, COFA selects action:**
- `trace_and_return` — create remediation row, owner COFA
- `pay_to_charity` — for items where trace failed and SRA-approved procedure followed
- `escalate_to_partners` — for items requiring partner sign-off
- `allocate` — for unallocated receipts now identified
- `write_off_with_sra_approval` — rare, requires evidence of SRA approval

**Output:** `AgedBalance` rows updated with actions. Remediation rows auto-created in `/remediation`. Status → `aged_balances_reviewed`.

### Phase 7 — COFA review and sign-off

**Pre-sign-off checklist (UI-enforced and server-validated):**
- Variance zero on all accounts (from Phase 5)
- All exceptions resolved with documented reasons
- Aged balances reviewed and actioned
- Breach implications assessed (Rule 7 etc.)
- Bank statements and working papers archived (auto)

**COFA electronic sign-off:**
- COFA name (from `req.auth.userId`, no override)
- COFA SRA number (from user record)
- Timestamp (server-side, ISO 8601)
- IP address (from request)
- User agent (from request)
- Hash of the generated reconciliation pack PDF (SHA-256)

**Confirmation text the COFA agrees to:** standard form, hard-coded so it can't be edited or weakened.

**Output:** `Reconciliation.signed_off_at`, `signed_off_by_user_id`, `signoff_hash` populated. Status → `signed_off`. Reconciliation becomes immutable from this point; reopening requires a new audit log entry and is restricted to admin role.

### Phase 8 — File, notify, schedule

**Filing (automatic):**
- Generate PDF pack server-side: cover sheet + three-way statement per account + exception log + aged-balance actions + COFA sign-off block
- Compute SHA-256 hash, store
- Apply 6-year retention end date (closure + 6 years per Rule 13)

**Notifications:**
- Email summary to managing partners (firm config)
- COLP notified if Rule 7 / serious-exception flags raised
- Auto-create breach records for flagged exceptions via `breachService.createBreach()` (cross-feature integration with the breach register feature)

**Action items:**
- Aged-balance remediation rows in `/remediation`
- Breach records in `/breaches`

**Schedule next:**
- Calendar entry created 28 days out (amber alert deadline)
- Background job armed for 35-day auto-breach if not signed off by then

**Output:** all of the above. Status → `filed`.

---

## 4. Data model

```
Reconciliation
  id, firm_id
  ref (RECON-YYYY-MM-NNN per firm)
  period_start, period_end
  status (enum: period_set, statements_uploaded, matching_complete,
          exceptions_resolved, three_way_complete, variance_blocked,
          aged_balances_reviewed, signed_off, filed)
  created_by_user_id, created_at
  signed_off_by_user_id (must be COFA role)
  signed_off_at
  signoff_ip, signoff_user_agent, signoff_hash
  pack_pdf_url, pack_pdf_hash
  retention_end_at
  next_due_at (28 days from signoff)
  reopened_at, reopened_by_user_id, reopen_reason

ReconciliationAccount
  id, reconciliation_id
  bank_account_id (FK to BankAccount)
  statement_balance, cashbook_balance, ledger_total
  variance, variance_resolved
  status (per-account status)

ReconciliationStatement
  id, reconciliation_account_id
  pdf_evidence_url, pdf_evidence_hash
  csv_evidence_url, csv_evidence_hash
  parsed_lines_jsonb (the CSV rows in structured form)
  period_start, period_end
  closing_balance, opening_balance

ReconciliationMatch
  id, reconciliation_account_id
  bank_line_id, cashbook_line_id (both refer into parsed_lines/Clio)
  matched_at, matched_by ('auto' | user_id)
  confidence (always 100 for v1 deterministic engine)

ReconciliationException
  id, reconciliation_account_id
  side (enum: bank, cashbook)
  line_data_jsonb (the unmatched line)
  reason (enum, see Phase 4)
  notes, action_taken
  resolved_at, resolved_by_user_id
  breach_id (nullable — if escalated to a breach)
  remediation_id (nullable — if flowed to remediation)

AgedBalance
  id, firm_id
  client_id, matter_id (Clio FKs)
  matter_status, matter_closed_at
  balance_amount, balance_currency
  age_days, age_category (enum: under_6m, 6_to_12m, over_12m, over_24m)
  trace_status (enum: not_attempted, in_progress, trace_failed, returned, paid_to_charity, escalated)
  last_action_user_id, last_action_at
  remediation_id (FK to remediation row)

BankAccount  -- firm config
  id, firm_id
  bank_name
  account_number, sort_code (or IBAN for non-UK)
  account_type (enum: general_client, designated_client, office)
  designated_for_matter_id (FK, nullable)
  designated_for_client_id (FK, nullable)
  currency
  clio_account_id (mirror)
  active

ReconciliationAuditLog  -- append-only
  id, reconciliation_id
  actor_user_id, actor_role
  action (enum: created, statement_uploaded, match_run, exception_resolved,
          aged_balance_actioned, three_way_calculated, signoff_attempted,
          signoff_completed, filed, reopened)
  before, after (jsonb)
  ip_address, user_agent
  timestamp
```

All firm-scoped tables under RLS using the `app.current_firm_id` GUC pattern. `ReconciliationAuditLog` revoked from UPDATE and DELETE at the DB level.

---

## 5. Clio integration

This is the only external system v1 reads from. Use the existing `seema-node/src/services/clio.ts` OAuth-based client.

**Phase 1 — Posting completeness:**
```
GET /api/v4/trust_line_items
  ?account_id={bankAccount.clio_account_id}
  &from={period_start}
  &to={period_end}
  &fields=id,date,description,reference,amount,matter_id,posted
```

Filter unposted client side. Surface count to COFA.

**Phase 2 — Statement parsing:**

PDF and CSV parsing happen in `seema-node`. No Clio interaction.

For CSV parsing, support the common UK bank export formats: Lloyds, NatWest, Barclays, HSBC, Cater Allen, Metro. Use `papaparse` (already in the React skill dependencies — likely available on the Node side too). Field detection by header pattern matching with a per-bank fallback config.

**Phase 3 — Auto-match:**

Pull all cashbook entries for the period:
```
GET /api/v4/trust_line_items
  ?account_id={bankAccount.clio_account_id}
  &from={period_start}
  &to={period_end}
  &fields=id,date,description,reference,amount,matter_id,client_id
```

Plus the period's individual client ledger balances (sum per matter):
```
GET /api/v4/trust_account_balances
  ?account_id={bankAccount.clio_account_id}
  &as_of={period_end}
  &group_by=matter
```

(API endpoint name is conventional; verify against Clio docs and adjust.)

Run the match in-memory. Don't write to Clio in this phase.

**Phase 4 — Clio corrections:**

For exceptions resolved with `action_taken = clio_correction_posted`, the service makes the appropriate Clio API call to post a correction:
```
POST /api/v4/trust_line_items
  { reverses_id, account_id, amount, reference, description, posted_by, posted_date }
```

Every correction also writes a `ReconciliationException` resolution row and a `ReconciliationAuditLog` row.

**Phase 5 — Read totals:**

Re-read cashbook balance and ledger total after corrections to confirm variance is zero. If non-zero, COFA cannot proceed.

**Phase 6 — Aged balances:**
```
GET /api/v4/trust_account_balances
  ?status=closed_matter
  &min_balance=0.01
  &as_of={period_end}
```

Plus matter close date for age calculation:
```
GET /api/v4/matters?ids=...&fields=id,closed_at,client_name
```

**Authentication and operational notes:** identical to the breach feature. Per SESSION_HANDOFF ticket #25, resolve the token refresh race condition before deploying. Per the same handoff, confirm the EU pod URL fix in `seema-api/services/clio.py:31` actually landed before relying on these calls.

---

## 6. Cross-feature integration

### → `/breaches`

Two integration points, both calling `breachService.createBreach()` from the existing breach feature:

**a. Rule 7 bank-charge exception.** Resolving an exception with reason `bank_charge_to_office` and the action `escalated_to_breach` creates a `Breach` row with:
```
{
  source: 'compliance_scan',
  sourceRef: `RECON-{recId}/EX-{exId}`,
  summary: `Bank charge debited to client account — £{amount}`,
  categories: ['client_money'],
  // suggested severity flag — COFA decides via triage
}
```

The breach lands in `/breaches` Pending Triage for the COLP, with full evidence from the reconciliation linked.

**b. 35-day Rule 8.3 auto-breach.** Background job runs daily. For any `Reconciliation.next_due_at` that has passed 35 days without a signed-off successor reconciliation, create:
```
{
  source: 'compliance_scan',
  sourceRef: `RECON-LATE/{firmId}/{periodEnd}`,
  summary: `Reconciliation overdue under SRA Accounts Rule 8.3`,
  categories: ['client_money'],
  // COLP will see this in Pending Triage and decide minor vs serious
}
```

### → `/remediation`

Phase 6 aged-balance actions auto-create rows in `/remediation`:
- Action `trace_and_return` → remediation step "Trace and return £X.XX to {client}"
- Action `pay_to_charity` → remediation step "Confirm SRA approval and pay £X.XX to chosen charity"
- Action `escalate_to_partners` → remediation step "Partner sign-off required for residual balance £X.XX"

### → `/sra-audit`

The existing SRA Audit Readiness page (per the audit doc) has a check `AR 3.3 — Client account reconciliation`. Update its check logic to read the latest `Reconciliation.signed_off_at` and pass/fail based on whether it is within 35 days. Pull through the COFA name and pack hash as evidence.

### → `/sra-return`

The annual return's AML / Accounts section needs the firm's reconciliation pattern. Surface this from the last 12 months of reconciliations: count signed off in time, count that hit 35-day breach, average days to reconcile.

---

## 7. Honest limitations and v2 work

**v1 covers Clio only.** Firms on other accounting systems are blocked. v2 adds CSV cashbook upload (firm uploads their own cashbook CSV alongside the bank statement CSV) as a universal fallback. v3 adds native LEAP, ALB, Quill, Insight Legal integrations.

**v1 is single-tier COFA only.** No cashier role. Above ~25 fee-earners this creates a workload problem. v2 adds a Cashier role with permissions limited to Phases 1-6. COFA retains Phase 7 and 8.

**v1 does not parse PDFs for transactions** — PDF is evidence-only, CSV required for matching. Most UK firms can get CSV from their banks (or convert via ABBYY / Excel). Firms that genuinely can't will need v2's OCR pipeline.

**v1 is single-currency.** Most UK firms hold only GBP. Firms with USD/EUR designated accounts can't reconcile those in v1. v2 adds multi-currency with FX rate handling.

**v1 has no Open Banking integration.** Statements are uploaded manually. v2 adds Plaid / TrueLayer for direct bank-API fetch.

**No COFA delegation in v1.** The signing COFA must be the firm's actual COFA — no temporary delegations during holiday cover. v2 adds delegation with audit trail.

**No multi-COFA support.** Firms with multiple COFAs (rare but exists in large firms with multiple SRA-authorised practices) get the primary COFA only. v2 adds.

---

## 8. Build sequencing

Phase 1 (3-4 weeks): data model + migrations + RLS + `BankAccount` config + reconciliation creation + period selection + posting completeness check. Phase 1 alone gives the COFA a way to start a reconciliation; nothing more.

Phase 2 (3-4 weeks): statement upload (PDF + CSV), parsing, auto-match engine, exception resolution UI. End of this phase the COFA can run a full reconciliation but cannot sign off (Phase 5+ still missing).

Phase 3 (2-3 weeks): three-way statement generation, COFA sign-off, pack PDF generation, audit trail completion. This phase makes the reconciliation submittable to an SRA inspector.

Phase 4 (2-3 weeks): aged balance review (Phase 6 of the workflow), cross-feature integration with `/remediation`, the auto-breach trigger at 35 days and Rule 7 integration with `/breaches`.

Phase 5 (2 weeks): trend dashboard on the register page, inspection pack export, COLP-facing notifications.

Total: 12-16 weeks for a 2-engineer team. Less than the breach feature because no AI dependency and only one external integration.

---

## 9. Smoke tests

Required to pass on staging before prod cut:

1. Create a reconciliation period for a test firm. Confirm `Reconciliation` and `ReconciliationAccount` rows created with correct `firm_id`.
2. RLS test: a second firm's user cannot see the first firm's reconciliations.
3. Upload PDF + CSV statement. Confirm hashes stored. Confirm CSV parsed into expected number of lines.
4. Run auto-match against a Clio dataset where you've planted: 1 exact match, 1 fuzzy mismatch, 1 unmatched bank line, 1 unmatched cashbook entry. Confirm only the exact match auto-clears.
5. Resolve each exception type. Confirm `bank_charge_to_office` with `escalated_to_breach` creates a breach record visible to the COLP role.
6. Force a non-zero variance. Confirm the sign-off route returns 400. Confirm the UI button is disabled.
7. Sign off with zero variance. Confirm `signed_off_at`, hash, IP captured in the audit log. Confirm the reconciliation becomes read-only.
8. Verify the `next_due_at` is 28 days after signoff. Run the late-recon job with the clock advanced 35 days; confirm a breach record is auto-created.
9. Aged balance with `pay_to_charity` action creates the expected remediation row.
10. Generate the inspection pack PDF. Confirm hash matches `pack_pdf_hash`. Confirm 6-year retention auto-calculated.

---

End of spec. The HTML prototype `seema-reconciliation.html` shows the UX shape this spec describes.
