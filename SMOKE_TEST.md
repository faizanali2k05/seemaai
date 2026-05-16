# Manual Smoke Test — 2026-05-10

**How to run this:**

1. Open http://localhost:3000 in Chrome (or your usual browser)
2. Open DevTools (Cmd+Option+I) → Network tab. Keep it open the whole time.
3. For each section below, do the listed actions and fill in the result.
4. Status options: `OK`, `BROKEN`, `PARTIAL`, `SKIPPED`.
5. For BROKEN: note the URL it tried to call, the HTTP status, and any visible error.
6. Don't fix anything — just record. We batch-fix after.

**Time budget:** 30 minutes. Skip anything that's clearly not core for launch.

---

## A. Account creation (no shared E2E user — make a fresh one)

Use a fresh email like `smoke-test-1@example.com`.

- [OK] **Register page** (`/register`) — does the page load?
      Status: ___
- [OK] Fill the form and click Register — does it succeed?
      Status: ___
      If BROKEN, what URL/status: ___
- [OK] After register, are you redirected somewhere reasonable (login or onboarding)?
      Status: ___
- [OK] **Login** with the credentials you just made
      Status: ___
- [OK] **Onboarding wizard** (`/onboarding`) — can you click through all steps and submit?
      Status: ___
      Notes: ___

---

## B. Daily-use surface

- [YES] **Dashboard** (`/dashboard`) — does it render? Are the panels populated or empty/error?
      Status: ___
      Network tab: any 4xx/5xx requests? List URLs: ___
- [NO] **Alerts** (`/alerts`) — list loads? Click on an alert — does it expand/show detail?
      Status: ___
- [NO] **Compliance scan** (`/compliance-scan`) — page loads? Run scan button works?
      Status: ___

---

## C. Core operational workflows

- [ ] **Matters** (`/matters`)
   - [ ] Page loads with list
   - [ ] "Create Checklist" button opens modal
   - [ ] Submit creates a matter (check Network for 2xx on POST /compliance/matters)
      Status: ___
- [ ] **Client Intake** (`/intake`)
   - [ ] Page loads
   - [ ] Can create new intake
      Status: ___
- [ ] **Conflicts** (`/conflicts`)
   - [ ] Page loads
   - [ ] "Run Conflict Check" opens modal
   - [ ] Submit returns a result
      Status: ___
- [ ] **AML** (`/aml`)
   - [ ] Page loads with stats
   - [ ] CDD section visible/usable
      Status: ___
- [ ] **Accounts** (`/accounts`) — client accounts page loads, transactions visible
      Status: ___

---

## D. Compliance + reporting (your flagship features)

- [ ] **SRA Audit** (`/sra-audit`) — YOUR ORIGINAL CONCERN
   - [ ] Page loads with audit items + score
   - [ ] "Generate Pack" button opens a popup
   - [ ] Popup contains a renderable PDF/HTML pack (not blank, not error)
      Status: ___
- [ ] **SRA Return** (`/sra-return`) — page loads, can edit/export
      Status: ___
- [ ] **Breaches** (`/breaches`)
   - [ ] List loads
   - [ ] "Report Breach" button opens form
   - [ ] Submit creates a breach with ICO deadline visible
      Status: ___
- [ ] **Audit Trail** (`/audit-trail`) and **Audit Report** (`/audit-report`)
      Status: ___
- [ ] **Regulatory** (`/regulatory`)
   - [ ] Updates list loads
   - [ ] Click "Interpret" on an update — does AI analysis actually run?
      Status: ___

---

## E. Staff + supervision

- [ ] **Staff** (`/staff`) — list loads, can add staff
      Status: ___
- [ ] **Staff Portal** (`/staff-portal`) — works for non-admin role?
      Status: ___
- [ ] **Supervision** (`/supervision`) — list loads, can schedule
      Status: ___
- [ ] **Policies** (`/policies`) — list loads, can edit
      Status: ___
- [ ] **Chasers** (`/chasers`) — list loads, can send chaser
      Status: ___

---

## F. Other

- [ ] **Undertakings** (`/undertakings`)
      Status: ___
- [ ] **Complaints** (`/complaints`)
      Status: ___
- [ ] **Remediation** (`/remediation`)
      Status: ___
- [ ] **Deadlines** (`/deadlines`)
      Status: ___
- [ ] **Key Dates** (`/key-dates`)
      Status: ___
- [ ] **Evidence** (`/evidence`) — upload works?
      Status: ___
- [ ] **Case Compliance** (`/case-compliance`)
      Status: ___
- [ ] **Data Management** (`/data-management`) — import/export
      Status: ___
- [ ] **Email Settings** (`/email-settings`)
      Status: ___
- [ ] **Security** (`/security`)
      Status: ___
- [ ] **Settings** (`/settings`) — change firm settings
      Status: ___
- [ ] **User Management** (`/user-management`) — invite/remove users
      Status: ___

---

## G. Cross-cutting things to notice

- [ ] Does the **navigation menu** show all pages, or any missing items?
- [ ] Does **logout** work?
- [ ] If you log out and try to visit `/dashboard`, does it redirect to `/login`?
- [ ] Are there any **console errors** (Cmd+Option+J → Console tab) on any page?
- [ ] Does any page take **noticeably long to load** (>3 sec)?

---

## Summary

When done, copy this section to me with a one-line summary of each broken thing:

**Broken (must fix before launch):**
- (e.g. "matters: create returns 500, error in logs about missing column status_enum")
- ___

**Broken (could ship without):**
- ___

**Looks fine:**
- ___

---

## Tips

- If a page errors out completely, screenshot it.
- For 4xx/5xx, expand the request in DevTools → Response tab to see the actual error message.
- If you see `TenantContextMissingError`, that's a wiring bug we know how to fix.
- If you see `column ... does not exist`, that's the schema-drift class of bug.
- If you see a 404 from `/api/...`, that's a route-mismatch class of bug.
- All three patterns have known fixes — don't get discouraged seeing many failures.
