# Seema SRA-vs-Case-Management Audit

**Audited:** 31 May 2026  •  **Method:** Live walkthrough of http://localhost via browser MCP, logged in as Sarah Mitchell (COLP), tenant Aldridge & Hayward Solicitors LLP, tier "Essentials"  •  **Routes audited:** 18  •  **Auditor stance:** Brutally honest, aggressive on "Clio already does this"

---

## TL;DR

Seema is already 80% an SRA-compliance product, not a case-management product, and you should stop worrying that it isn't. The product literally brands itself "Seema — Compliance Platform" in the `<title>`, and 14 of 18 top-level routes either cite a specific SRA / MLR / UK GDPR obligation or only make sense inside one.

The real risk isn't that Seema is too case-management. It's that **three or four features (Matters, Deadlines, Staff, Chasers) sit on the boundary and could drift into PMS turf** if you're not deliberate about it. Those are the ones to discipline — not by killing them, but by renaming and narrowing them so they read as "compliance layer on top of the PMS," not "matter management."

The single strongest strategic move you have available is to **double down on the Scan → Alerts → Remediation → Policies → SRA Audit → SRA Annual Return loop**. That's the loop Clio cannot build, because building it would require taking a regulatory point of view they're not willing to take across 50 jurisdictions. Every other UK case-management vendor (LEAP, ActionStep, Tikit) has some pieces of it but no one has all of it joined up with an AI horizon-scanning feed on top.

The single strongest feature in the product right now is `/sra-audit` — the gap-analysis page that scores 12 SRA Standards & Regulations checks and exports an "SRA Visit Pack". That page is what every other page should aspire to look like.

---

## Strategic frame

The question you posed was "case-management vs SRA-compliance." That's the right axis but the more useful version is **"things Clio also does" vs "things only a UK regulatory-compliance product would do."** Clio's UK product has matter management, basic conflict checks, document management, billing/time, calendaring, and integrations into UK CDD vendors (SmartSearch, Lawyer Checker, Lexis Conflicts). What Clio does **not** do — and almost certainly will not build, because it does not align with their 50-jurisdiction wedge — is:

- Take an opinionated regulatory point of view ("here is the SRA Code paragraph this violates")
- Maintain a live regulatory horizon-scanning feed
- Generate, store, and version control firm-level policies
- Run a gap-analysis audit against a specific regulator's rules
- Automate a specific regulator's annual return
- Track solicitor-specific obligations like Undertakings and COLP/COFA duties

Those are the seven defensible categories. Seema covers all seven today, with varying depth. Your goal should be to deepen those and trim everything that competes with Clio head-on.

---

## Feature audit — all 18 routes

The classification uses four buckets:

- **SRA-DIFFERENTIATOR** — Clio doesn't have this; only a regulator-specific product does it; keep and lean in
- **SRA-COMMODITY** — Mapped to an SRA obligation but Clio also does it natively; has to exist for completeness but is not a wedge
- **DUAL-USE / DRIFT RISK** — Sits on the boundary; could drift into case-management; needs disciplining
- **CASE-MANAGEMENT BLOAT** — Belongs in Clio, should be cut or downgraded

### 1. `/dashboard` — Home dashboard

Surfaces: Compliance Score Trend, Open Items by Category, Daily Briefing, Regulatory Updates, plus six KPI cards (Open Matters, Critical Items, Pending Intakes, Active Staff, Open Breaches, Pending Tasks). Pills for Overdue Training, Overdue Reviews, Open Breaches, Pending Intakes, Reg Updates, Overdue Supervision.

**Verdict: SRA-DIFFERENTIATOR with one bloat KPI.** The Compliance Score Trend and the Overdue Supervision / Overdue Training / Open Breaches / Reg Updates surfacing is exactly what a COLP dashboard should look like. The only weak signal is the "OPEN MATTERS: 6" KPI — it's a number a PMS surfaces, not a compliance KPI. Replace it with something like "Matters flagged for review" or remove it entirely. The page-load alert "7 overdue items — action required before end of day" is gold; double down on that framing.

### 2. `/regulatory` — Regulatory Updates

"Live feed from SRA, ICO, HMRC, GOV.UK & Law Society — with AI-powered firm-specific analysis and full audit trail." Sources: SRA, ICO, HMRC, GOV.UK, Law Society, OFSI. 10 sample updates with severity, "Analyse for my firm" CTA. Footer: "Seema provides regulatory interpretation to assist your compliance decisions. Final responsibility remains with your COLP."

**Verdict: SRA-DIFFERENTIATOR — among the strongest in the product.** Clio does not aggregate UK regulatory updates and has no AI interpretation layer. The COLP disclaimer is correctly scoped. The "Applicable to You" filter (showing 0 in this tenant — none analysed yet) is the right metric. The "Interpretation History" tab implies versioned analysis with audit trail — important for the SRA's evidence-of-compliance expectation. Push the firm-specific analysis hard; this is the AI moat.

### 3. `/aml` — AML / CDD

Customer Due Diligence records with simplified / standard / enhanced tiers, PEP flagging (2 currently), SARs register, SOF (Source of Funds) verification. 10-row table with Risk Level (Low / Medium / High / Very High), ID Verified / Address Verified / SOF Verified columns. Tabs: CDD Records, SAR Register, New Client Intake.

**Verdict: SRA-DIFFERENTIATOR (with caveat).** Textbook MLR 2017 / SRA AML implementation. Risk-based tiering aligns to Reg 28(2). PEP and SAR are statutory categories. The caveat: Clio's UK partners (SmartSearch, Veriphy, Thirdfort) do this for Clio users via integrations — many UK firms already have an AML vendor. So this is differentiator-vs-Clio-natively but commodity-vs-CDD-vendors. Position it as: "the AML record-keeping layer, integrated with your existing CDD vendor," not as "we replace SmartSearch." Build the integration to read SmartSearch / Thirdfort results so the firm doesn't double-enter.

### 4. `/chasers` — Reminders & Follow-ups

"Track compliance reminders, follow up on overdue training and reviews, manage escalations." Chase Overdue Reviews, Chase Overdue Training, Send Manual Chase. Types include Training, Supervision, CDD. Sample: "Overdue: AML annual refresher", "Trainee supervision — Charlotte Davies", "CDD refresh due — Lakeside Investments (PEP)".

**Verdict: DUAL-USE / DRIFT RISK.** The categories are SRA-coded (training, supervision, CDD) but the underlying mechanic is "send reminders, escalate if no response," which is generic workflow. Clio has tasks and reminders. The thing that protects this from being commodity is that the chases are *automatic outputs of compliance scans*, not user-created. As long as users do not start manually creating arbitrary chases, this stays compliance-shaped. Add a guardrail: "Manual Chase" should only allow selecting a compliance category, not free text.

### 5. `/conflicts` — Conflict of Interest Checker

7 checks, parties register with 5 parties, status (Clear / Flagged / Pending). Standard solicitor conflict check.

**Verdict: SRA-COMMODITY.** Code of Conduct for Solicitors para 6.2 obligation. **Clio Manage has this natively, and partner integrations (Lexis Visualfiles, Tikit P4W, Lawyer Checker) deepen it.** Has to exist for the product to feel complete, but is not a wedge. Two options: (a) keep it functional but invest minimum, or (b) differentiate by making it the only conflict checker that *audits the audit trail* — every conflict check produces a timestamped, immutable evidence record for an SRA inspection. The second option turns a commodity into evidence-generation, which fits Seema's wider story.

### 6. `/matters` — Matter Compliance Review

"AI-assisted compliance review across the firm's matters. Flags missing CDD, overdue checklist items, and regulatory gaps — synced from your PMS where connected." Table: Matter Ref, Client, Type (Conveyancing / Litigation / Family / Criminal / Commercial), Progress, Status, Fee Earner. Actions: AI Review, View, Create Checklist.

**Verdict: DUAL-USE / DRIFT RISK — biggest one in the product, also potentially biggest opportunity.** The "synced from your PMS where connected" framing is exactly right — Seema is the *compliance layer*, the PMS owns the matter. But the page renders identically to a Clio Matters page on first look (Matter Ref, Client, Type, Fee Earner), which is dangerous: a COLP demoing this gets the "isn't this just Clio?" reaction. Three fixes:

- Rename the route to `/matter-review` and the page title to "Matter Compliance Review" (it already partially does this; commit fully).
- Replace the "Progress 0/0 items" column — which reads like a case-progress bar — with a **Compliance Status** column (e.g. "CDD complete · 2 checklist items overdue · conflict clear"). That tells the COLP the *only* thing they should be looking at.
- The "Type" column should be *Matter Compliance Profile*, not the matter type. Conveyancing has very different obligations than Family (SDLT, Lender's Handbook, source-of-funds depth) — surface those at-a-glance.

If you nail this page, it's the **second-strongest differentiator** after the audit page, because Clio could in theory bolt this on but won't, because it requires opinionated rule-writing per matter type per jurisdiction.

### 7. `/deadlines` — Deadlines

9 items mixing ICO breach notification (compliance), AML refresher training (compliance), client account reconciliation (Accounts Rules — compliance), PII renewal (compliance), supervision (compliance), SRA Annual Return (compliance) — **but also** "Defence filing — AH-2025-0067 (Northwood v Marston)" (litigation) and "Conveyancing completion — AH-2025-0156 (Chowdhury)" (matter milestone).

**Verdict: DUAL-USE — should be split.** The compliance deadlines belong here; the court / matter deadlines do not. Clio has a matter calendar, court rules docketing, and integrations into HMCTS CE-file. Seema will lose that fight. **Cut "Defence filing" and "Conveyancing completion" from this view**, or move them behind a separate "Matter Deadlines (synced from PMS)" tab so it's clear those are read-only mirrors, not Seema's source-of-truth. Default tab should be compliance-only.

### 8. `/undertakings` — Undertakings Register

7 entries with Direction (Given / Received), Description (e.g. "To discharge Lloyds Bank charge over Flat 4, Pemberton"), Client / Matter, Given To / Received From, Due Date, Risk Level, Status. Actions: Fulfil, Report Breach.

**Verdict: SRA-DIFFERENTIATOR.** SRA Code of Conduct for Solicitors para 1.3: "You perform all undertakings given by you, and do so within an agreed timescale or if no timescale has been agreed then within a reasonable amount of time." Clio Manage does not have a native solicitor's undertakings register. UK PMSes (LEAP, Tikit) do, so this is differentiator-vs-Clio but commodity-vs-UK-PMS. The "Report Breach" action that flows straight into the breach log is the integration that distinguishes Seema here. Add a citation footer ("Source: SRA Code of Conduct for Solicitors, paragraph 1.3") matching the `/supervision` page convention.

### 9. `/compliance-scan` — Compliance Scan Tool

Big CTA "Run Full Compliance Scan." Scan history showing "9 issues found, 78%." Three-tab navigation across Compliance Scan, Alerts, Remediation.

**Verdict: SRA-DIFFERENTIATOR.** Clio has nothing equivalent. The Scan → Alerts → Remediation triad is conceptually the strongest workflow in the product. The page itself is currently thin (just a big button and a scan history); the *result* of the scan is what's valuable, and that lands in `/alerts` and `/remediation`. Consider merging the three routes into a single `/compliance` workspace with three tabs, so the loop is obvious to users.

### 10. `/complaints` — Complaints Handling

4 total, with SRA-REPORTABLE 1, LEO-ESCALATED 0, OVERDUE ACK 1. Categories: Service Quality, Costs, Delay, Communication, Confidentiality, Conflict, Other. Statuses: Open, Acknowledged, Investigating, Resolved, Escalated. Outcomes: upheld, partially upheld.

**Verdict: SRA-DIFFERENTIATOR.** SRA Code 8.2 requires a written complaints procedure; Code 8.5 requires acknowledgement within prescribed periods; Code 7.7 requires reporting "serious breach" to the SRA. The fact that the table has dedicated "SRA REPORTABLE" and "LEO ESCALATED" KPIs is the right SRA-native framing. Clio has no complaints module. Differentiator. Add automation: when a complaint is marked Upheld + Costs + over £X, auto-flag SRA-reportable and pre-fill the breach log.

### 11. `/breaches` — Breach Log

OPEN BREACHES 1, ICO NOTIFIED 1, AVG RESOLUTION 4.2 days, TOTAL 3. Live countdown: "ICO 72-HOUR NOTIFICATION DEADLINE — 53h 59m remaining." Cites "UK GDPR Article 33(1) — controllers must notify the supervisory authority without undue delay and where feasible within 72 hours of becoming aware of a personal data breach." Types: data, regulatory.

**Verdict: SRA-DIFFERENTIATOR — best-shipped feature in the product.** The live countdown on a critical data breach is precisely the UX a COLP needs when the worst day of the year happens. The Article 33(1) citation at the top of the alert is gold. Clio doesn't do this at all. Extend the "regulatory" breach type to flag SRA-reportable breaches (Code 7.7) with their own countdown — the SRA expects "prompt" reporting and "prompt" is undefined, but most firms try to file within 14 days. Surface that timer too.

### 12. `/remediation` — Remediation Plans

3 active plans: misdirected-email data breach, bring AML training back into compliance, tighten client-account reconciliation cadence. Each plan has Steps Completed, Assigned To, Deadline.

**Verdict: SRA-DIFFERENTIATOR.** Closes the loop from `/compliance-scan` and `/alerts`. Clio has tasks but not "remediation plans tied to compliance gaps." Lean into this. The fact that each plan has a name like "Bring AML training back into compliance" — using regulatory framing not generic task framing — is the right pattern.

### 13. `/policies` — Policies & Procedures

Six policies: AML Policy (v3.1), Data Protection & GDPR Policy (v2.4), Complaints Handling Policy (v2.0, Under Review), Anti-Bribery & Anti-Corruption Policy (v1.6), EDI Policy (v2.2), Firm-wide Risk Management Policy (v1.8). "Generate Policy" button. Categories: AML, Data Protection, Complaints, Equality, Anti-Corruption, Risk Management.

**Verdict: SRA-DIFFERENTIATOR (high-stakes).** Every policy is mapped to a specific obligation: AML to MLR 2017 Reg 19, Data Protection to UK GDPR Art 24, Complaints to SRA Code 8.2, Anti-Bribery to Bribery Act 2010 / SRA Principles, EDI to SRA Code 1.1, Risk Management to SRA Code 2.5. The "Generate Policy" implying AI-drafted policies is potentially huge — *but is also the highest legal-risk feature in the product*. A bad AI-generated AML policy that a firm relies on is professional negligence with regulatory exposure. Get the policy templates lawyer-reviewed before they're shipped, and add prominent disclaimers + a mandatory "COLP sign-off" gate before any AI-drafted policy can be activated.

### 14. `/alerts` — Compliance Alerts

7 alerts with categories: AML / Training (Critical), Accounts Rules (High), Data Protection (Critical), CDD/EDD (High), Insurance (Medium), Supervision (Medium), Undertakings (Low). Each has Severity, Status, Created date, Assignee.

**Verdict: SRA-DIFFERENTIATOR.** The actionable layer on top of the Scan. Each alert maps to a specific obligation and category. Clio doesn't categorise tasks by regulatory obligation. Differentiator. Consider auto-routing: any "Critical / Data Protection" alert auto-assigns to the COLP and starts a 72-hour breach timer.

### 15. `/staff` — Staff & Training

18 staff, 15 with training records. Tabs: Staff Directory (18), Training Overview (15), CPD Dashboard, File Reviews (0). Roles include `colp`, `partner`, `solicitor`. Note: "user slots remaining (0/10) — Upgrade to Professional for unlimited users." Tier-gated.

**Verdict: DUAL-USE / DRIFT RISK.** The basic staff directory is generic HR (commodity). The CPD Dashboard and File Reviews tabs are SRA-mapped — CPD to the Continuing Competence framework, File Reviews to SRA Code 4 supervision. Recommendation: **rename the route from `/staff` to `/compliance-roles` and reframe the page as "Compliance Roles, Training & File Reviews"**, making clear the staff directory is a means to an end, not the product. The COLP role being a first-class concept is correct.

### 16. `/supervision` — Supervision

Cites "SRA Code of Conduct for Firms, Rule 3 — supervision arrangements" at the top, and again at the bottom ("Source: SRA Code of Conduct for Firms, Rule 3 — sra.org.uk"). 6 supervisee-supervisor relationships with cadence (30 days / 90 days), last session, status (On Track / Overdue ≤7d / Overdue >7d).

**Verdict: SRA-DIFFERENTIATOR — gold standard page.** This is what every other page should look like. Cites the obligation at the top *and* the bottom. Tracks against a cadence with automated status calculation. Implies a daily reminder digest at 08:00. Clio has nothing like this. UK PMSes have weaker versions. **Use this page as the template for `/undertakings`, `/conflicts`, and others — explicit citation, cadence-based status, automatic escalation.**

### 17. `/sra-audit` — SRA Audit Readiness

**This is the killer feature.** 78% overall readiness across 12 checks (6 passing, 4 partial, 2 failing). Each check cites a specific obligation: SRA P1.4 (Principles — Honesty), SRA P2.1 (Public trust), AR 3.3 (Accounts Rules — reconciliation), AR 5.1 (residual client balances), CoC 4.1 (conflict checks), CoC 7.1 (supervision of trainees), MLR 18 (firm-wide AML risk), MLR 19 (CDD on high-risk clients), GDPR Art 33 (data breach reporting), GDPR Art 30 (records of processing), Trans 1 (Transparency rules — prices), CPD (continuing competence). Each check has a required action, evidence count, and last-reviewed date. "Generate SRA Visit Pack" button.

**Verdict: SRA-DIFFERENTIATOR — the single strongest defensible feature in the product.** No case-management tool builds this. The SRA Visit Pack is the kind of artefact a COLP can hand to an inspector and immediately demonstrate compliance posture. Three improvements:

- Add the **SRA Standards & Regulations 2019 Outcomes-Focused framework** structure — the SRA has moved away from rule-checklists toward outcomes assessment. Make sure each check is framed as "evidence we achieve outcome X," not just "rule X passed."
- The "12 checks" is too few. The SRA Standards & Regs has dozens of obligations a firm must demonstrate. Expand to at least 30–40 checks covering: Code of Conduct for Firms paras 1–9, Code of Conduct for Solicitors paras 1–8, all of MLR 2017 Part 3 (CDD), Accounts Rules Parts 2–7, Transparency Rules, Lexcel cross-mapping if firm holds it, SRA Continuing Competence framework.
- Make the evidence items actually link out to source: clicking "5 evidence items" on MLR 19 should jump to the EDD records in `/aml`.

### 18. `/sra-return` — SRA Annual Return

71% complete across 7 sections: Firm Details (✓), Practice Areas (✓), Turnover Band (✓), Indemnity Insurance (6/8), AML & MLRO (✓), Diversity Data (5/10), Complaints Data (✓). Captures Firm Name, SRA Number, COLP, COFA. "Walk through return", "Export for SRA", "Submit Return" actions.

**Verdict: SRA-DIFFERENTIATOR.** Direct automation of the mySRA Annual Return — a yearly obligation every regulated firm has. Clio doesn't do this. Differentiator. Two notes: (a) the "Submit Return" CTA implies direct API integration with mySRA; if that doesn't exist (mySRA has no public API I'm aware of as of May 2026), it needs to be either a guided export workflow or genuinely call the API; users will hate a button that doesn't actually submit. (b) "Diversity Data" auto-population from the staff directory would be a real win — the SRA's diversity questions are notoriously tedious to fill in manually.

---

## The defensible loop

The pages above are stronger as a *system* than individually. Here is the loop, made explicit:

A regulatory update lands in `/regulatory`. The AI analysis produces "applicable to this firm" findings. A finding triggers a row in `/compliance-scan` next time the scan runs. Failing rows become `/alerts`. Alerts get assigned and turn into `/remediation` plans. Remediation plans, when complete, update the relevant `/policies` (versioned, audit-trailed), update the `/sra-audit` readiness score, and contribute evidence to the next `/sra-return`.

Clio cannot build this loop. It would require them to (a) maintain an opinionated UK regulatory ruleset, (b) update it as the SRA rewrites the Handbook, (c) take legal responsibility for the interpretations, and (d) cross-link to evidence artefacts. Their wedge is the global PMS; this loop is a regulator-specific layer. The strategic move is to **make the loop the spine of the product** — every page should make its place in the loop visible, every page should link to the next step. Right now the loop is conceptually there but not surfaced. A user could miss it.

---

## What to cut, narrow, or rename

| Route | Action | Why |
|---|---|---|
| `/matters` | Rename UI to "Matter Compliance Review" everywhere; replace Progress with Compliance Status column; replace matter Type with Matter Compliance Profile | Page currently reads as Clio-lite at a glance |
| `/deadlines` | Cut court / matter milestone deadlines from default view; add a read-only "Matter Deadlines (synced)" secondary tab | Competing with Clio's calendar / docketing |
| `/staff` | Rename to `/compliance-roles`; reframe page as "Compliance Roles, Training & File Reviews" | Generic-HR labelling weakens the compliance pitch |
| `/chasers` | Restrict "Send Manual Chase" to selecting a compliance category (no free text) | Prevents drift into generic task management |
| `/dashboard` | Drop or reframe the "OPEN MATTERS" KPI | It's the only KPI on the home page that isn't compliance-coded |

None of these are removals of value. Each preserves the underlying feature and re-positions it. The cumulative effect is that a COLP who demos Seema next to Clio sees seven non-overlapping pages of compliance value, not "another Clio with extra tabs."

---

## SRA obligations Seema does *not* yet cover

Gaps where the SRA expects firms to maintain compliance evidence and Seema currently has no surface. These are the next-feature candidates:

| Obligation | Source | Current coverage |
|---|---|---|
| Equality, Diversity & Inclusion data collection — the SRA's biennial EDI survey | SRA Standards & Regs / Code 1.1 | Policy exists; data collection workflow does not |
| Continuing Competence reflective practice — each solicitor must annually reflect and declare | SRA Continuing Competence framework | CPD hours tracked; reflective declarations not captured |
| Lexcel / CQS standards mapping for firms holding those quality marks | Law Society Lexcel; CLC for CQS | No mapping layer |
| Anti-money laundering Independent Audit (every firm in the regulated sector) | MLR 2017 Reg 21 | Not surfaced |
| Mandatory firm-wide AML training records with passport-grade evidence (SRA AML thematic review 2023) | MLR 2017 Reg 24 | Training tracked but evidence depth shallow |
| Client account interest calculation and "fair sum" determinations | SRA Accounts Rules 7 | Not surfaced |
| Sanctions screening on clients and counterparties (OFSI list — the regulatory feed flags it but nothing actions it) | Sanctions and Anti-Money Laundering Act 2018 | Feed item only, no client-screening workflow |
| Transparency rules — published prices, complaints information, SRA digital badge | SRA Transparency Rules | Audit page acknowledges; no toolkit to maintain |
| Solicitors' Indemnity Insurance — annual renewal with claims history | SRA Indemnity Insurance Rules | Surfaced as a deadline / SRA Return field; no renewal workflow |

The largest unaddressed surface is **EDI data collection and the AML Independent Audit workflow**. Both are SRA expectations that no Clio user has a clean answer for, and both are well-suited to Seema's existing data model.

---

## On the open questions from the handoff

The SESSION_HANDOFF flagged three open questions. The audit changes the picture on two of them:

**Question 1 — apex `seemaai.co.uk` vs subdomain `app.seemaai.co.uk`.** This is the root cause of your Clio OAuth redirect_uri mismatch and you should pick one before launch. **Recommendation: use `app.seemaai.co.uk` for the application, keep `seemaai.co.uk` for the marketing site.** Two reasons specific to a compliance product: (a) regulators and audit reviewers expect the application URL to be distinct from the marketing surface; (b) firm IT teams allowlist app subdomains more comfortably than apex domains. Update the Clio portal to match, and update `CLIO_REDIRECT_URI` in both `.env`s accordingly.

**Question 2 — kill FastAPI or formalize the Node/FastAPI split.** Given how much of the differentiated value lives in AI-mediated work (regulatory interpretation in `/regulatory`, gap analysis in `/sra-audit`, AI Review in `/matters`, Generate Policy in `/policies`, automated Compliance Scan), formalize the split. FastAPI owns AI + background workers, Node owns HTTP/CRUD/auth. The architectural fragility you hit during the demo (nginx hard-depending on FastAPI at startup) is fixable with a nginx `resolver` directive; that's a 30-line nginx.conf change and doesn't require killing FastAPI.

**Question 3 — production deploy target.** Not changed by the audit. Make whatever decision matches your team's ops expertise.

---

## What to do this week

Three things, in this order, with the strategic frame above in mind:

1. Fix the demo so you can show this to people. The nginx race needs the `resolver` directive (separate doc). The leaked secrets need rotation (separate runbook still owed).
2. Rename `/matters`, `/staff`, and `/deadlines` per the table above. The frontend renames are low-risk and reposition the product immediately.
3. Pick one of the seven coverage gaps and ship it. **The AML Independent Audit workflow (MLR 2017 Reg 21)** is the strongest candidate because (a) every regulated firm is required to have one, (b) very few firms actually do it well, (c) it cleanly extends the existing `/sra-audit` and `/policies` modules, and (d) Clio users have no answer.

The product is already substantially what you want it to be. The work isn't to make it more SRA-specific from scratch — it's to discipline the boundary so it stops looking like Clio-with-extras, and then to deepen the loop you've already half-built.
