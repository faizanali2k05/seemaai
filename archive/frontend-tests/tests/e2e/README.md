# Seema E2E tests

Playwright-driven smoke tests covering the six critical user workflows.
Each test verifies that the relevant button(s) actually call the right
backend endpoint and the response is 2xx. They are deliberately shallow
(catching the "button does nothing" class of bug) rather than exhaustive —
add deeper UI assertions as you discover regressions worth pinning.

## What's covered

| File | Workflow | What it proves |
|------|----------|----------------|
| `01-account-creation.spec.ts` | Register → Login → Onboarding | Auth round-trip + onboarding-complete endpoint |
| `02-sra-audit-pdf.spec.ts` | SRA Audit page → Generate Pack | Both proxied URLs work, popup renders |
| `03a-create-matter.spec.ts` | Create matter | Matter create form submits and the row appears |
| `03b-conflict-check.spec.ts` | Run conflict check | `/compliance/conflicts/check` returns 2xx |
| `04-regulatory-interpret.spec.ts` | Regulatory updates → AI interpret | List loads + interpret button calls AI proxy |
| `05-breach-report.spec.ts` | File breach → ICO deadline | Form submits + deadline indicator renders |
| `06-dashboard.spec.ts` | Dashboard | All 3 backend fetches resolve, no React crashes |

## Setup

```bash
cd seema-web
npm install
npx playwright install chromium
```

## Run

The tests assume the full Docker stack is up:

```bash
docker compose up -d
# Wait for everything to be healthy
docker compose ps
```

Then in `seema-web/`:

```bash
npm run test:e2e            # headless, full suite
npm run test:e2e:ui         # interactive Playwright UI
npm run test:e2e:headed     # see the browser as tests run
```

A specific test:
```bash
npx playwright test tests/e2e/02-sra-audit-pdf.spec.ts
```

With more output on failure:
```bash
npx playwright test --reporter=list --workers=1
```

## What you'll see when something fails

Playwright produces:
- A trace file (`playwright-report/`) you can open with `npx playwright show-report`
- A screenshot at the moment of failure
- A short video of the run

The test names and error messages are written to point at the most likely
cause (e.g. "If this 404s, the proxy in aiProxy.ts is missing").

## Test data

Each test registers a fresh firm with a timestamped email
(`e2e-{stamp}@seema-test.invalid`) so runs don't collide. The data
accumulates in your dev database. To clean up after lots of runs:

```sql
-- Inside docker compose exec db psql -U seema -d seema:
DELETE FROM user_accounts WHERE email LIKE 'e2e-%@seema-test.invalid';
DELETE FROM firms WHERE name LIKE 'E2E % Test Firm' OR name LIKE '%Test Firm%';
```

(RLS is bypassed because `seema` is the superuser used here.)

## CI

Add to GitHub Actions / your CI of choice:

```yaml
- run: docker compose up -d
- run: npx wait-on http://localhost:3000 http://localhost:4000/api/health
- run: cd seema-web && npm install && npx playwright install --with-deps chromium
- run: cd seema-web && npm run test:e2e
- if: failure()
  uses: actions/upload-artifact@v4
  with:
    name: playwright-report
    path: seema-web/playwright-report/
```

## When tests fail

The expected initial state of the suite, on first run after these were written:

- ✅ `01-account-creation`: should pass — endpoints proven during Cowork session
- ✅ `02-sra-audit-pdf`: should pass — proxy was just fixed in this session
- ⚠️ `03a-create-matter`: may fail on label-matching if your form labels differ from the regex; adjust selectors
- ⚠️ `03b-conflict-check`: same caveat, adjust selectors if needed
- ⚠️ `04-regulatory-interpret`: depends on Anthropic key being present and the scrape having run — tests skip gracefully if no data
- ⚠️ `05-breach-report`: the `affected_records` field shape may not match Prisma's expectations; investigate if 4xx
- ✅ `06-dashboard`: should pass

Treat the first run as a discovery exercise — every failure is either a
real bug or a selector that needs tightening. Don't blanket-skip. Each
failure tells you something useful about the app.
