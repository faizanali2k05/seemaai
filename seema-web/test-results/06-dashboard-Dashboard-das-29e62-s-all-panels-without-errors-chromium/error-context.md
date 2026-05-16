# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 06-dashboard.spec.ts >> Dashboard >> dashboard loads all panels without errors
- Location: tests/e2e/06-dashboard.spec.ts:25:7

# Error details

```
Error: Dashboard never received a successful response from /compliance/regulatory-updates. Either the endpoint is broken or the dashboard never called it.

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - complementary [ref=e3]:
      - generic [ref=e4]:
        - generic [ref=e5]:
          - heading "Seema" [level=1] [ref=e6]
          - generic [ref=e7]: Essentials
        - paragraph [ref=e8]: Compliance Platform
      - navigation [ref=e9]:
        - generic [ref=e10]:
          - link "Dashboard" [ref=e11] [cursor=pointer]:
            - /url: /dashboard
            - img [ref=e12]
            - generic [ref=e17]: Dashboard
          - link "Regulatory Updates" [ref=e18] [cursor=pointer]:
            - /url: /regulatory
            - img [ref=e19]
            - generic [ref=e21]: Regulatory Updates
          - link "SRA Audit" [ref=e22] [cursor=pointer]:
            - /url: /sra-audit
            - img [ref=e23]
            - generic [ref=e26]: SRA Audit
          - link "AML / CDD" [ref=e27] [cursor=pointer]:
            - /url: /aml
            - img [ref=e28]
            - generic [ref=e37]: AML / CDD
          - link "Reminders" [ref=e38] [cursor=pointer]:
            - /url: /chasers
            - img [ref=e39]
            - generic [ref=e41]: Reminders
        - button "More" [ref=e43] [cursor=pointer]:
          - generic [ref=e44]: More
          - img [ref=e45]
      - generic [ref=e47]:
        - generic [ref=e48]:
          - paragraph
        - button "Logout" [ref=e49] [cursor=pointer]:
          - img [ref=e50]
          - generic [ref=e53]: Logout
    - main [ref=e54]:
      - button "Notifications (0)" [ref=e58] [cursor=pointer]:
        - img [ref=e59]
      - generic [ref=e63]:
        - generic [ref=e64]:
          - generic [ref=e65]:
            - generic [ref=e66]:
              - heading "Good evening, COLP" [level=1] [ref=e67]
              - paragraph [ref=e68]:
                - text: Sunday, 10 May 2026 · E2E Shared Firm 1778431359390
                - generic [ref=e69]: Essentials
            - button "Run Compliance Scan" [ref=e71] [cursor=pointer]:
              - img [ref=e72]
              - text: Run Compliance Scan
          - generic [ref=e74]:
            - img [ref=e76]
            - paragraph [ref=e79]: No urgent actions — your compliance position is strong
        - generic [ref=e80]:
          - button "Open Matters" [ref=e81] [cursor=pointer]:
            - generic [ref=e82]:
              - generic [ref=e83]:
                - paragraph [ref=e84]: Open Matters
                - paragraph [ref=e86]: "0"
              - img [ref=e89]
          - button "Critical Items" [ref=e92] [cursor=pointer]:
            - generic [ref=e93]:
              - generic [ref=e94]:
                - paragraph [ref=e95]: Critical Items
                - paragraph [ref=e97]: "0"
              - img [ref=e100]
          - button "Pending Intakes" [ref=e102] [cursor=pointer]:
            - generic [ref=e103]:
              - generic [ref=e104]:
                - paragraph [ref=e105]: Pending Intakes
                - paragraph [ref=e107]: "0"
              - img [ref=e110]
          - button "Active Staff" [ref=e114] [cursor=pointer]:
            - generic [ref=e115]:
              - generic [ref=e116]:
                - paragraph [ref=e117]: Active Staff
                - paragraph [ref=e119]: "0"
              - img [ref=e122]
          - button "Open Breaches" [ref=e127] [cursor=pointer]:
            - generic [ref=e128]:
              - generic [ref=e129]:
                - paragraph [ref=e130]: Open Breaches
                - paragraph [ref=e132]: "0"
              - img [ref=e135]
          - button "Pending Tasks" [ref=e137] [cursor=pointer]:
            - generic [ref=e138]:
              - generic [ref=e139]:
                - paragraph [ref=e140]: Pending Tasks
                - paragraph [ref=e142]: "0"
              - img [ref=e145]
        - generic [ref=e148]:
          - generic [ref=e149]:
            - heading "Compliance Score Trend" [level=3] [ref=e150]
            - img [ref=e153]:
              - generic [ref=e158]:
                - generic [ref=e160]: Nov
                - generic [ref=e162]: Dec
                - generic [ref=e164]: Jan
                - generic [ref=e166]: Feb
                - generic [ref=e168]: Mar
                - generic [ref=e170]: Apr
              - generic [ref=e172]:
                - generic [ref=e174]: "0"
                - generic [ref=e176]: "25"
                - generic [ref=e178]: "50"
                - generic [ref=e180]: "75"
                - generic [ref=e182]: "100"
          - generic [ref=e189]:
            - heading "Open Items by Category" [level=3] [ref=e190]
            - img [ref=e193]:
              - generic [ref=e198]:
                - generic [ref=e200]: Training
                - generic [ref=e202]: Reviews
                - generic [ref=e204]: Breaches
                - generic [ref=e206]: Intakes
                - generic [ref=e208]: Supervision
              - generic [ref=e210]:
                - generic [ref=e212]: "0"
                - generic [ref=e214]: "3"
                - generic [ref=e216]: "6"
                - generic [ref=e218]: "9"
                - generic [ref=e220]: "12"
        - generic [ref=e236]:
          - generic [ref=e237]:
            - generic [ref=e239]:
              - button "Daily Briefing 0" [ref=e240] [cursor=pointer]:
                - generic [ref=e241]:
                  - text: Daily Briefing
                  - generic [ref=e242]: "0"
              - button "Regulatory Updates 0" [ref=e244] [cursor=pointer]:
                - generic [ref=e245]:
                  - text: Regulatory Updates
                  - generic [ref=e246]: "0"
            - generic [ref=e248]:
              - img [ref=e250]
              - heading "All clear" [level=3] [ref=e252]
              - paragraph [ref=e253]: No action items today — your compliance position is strong
          - generic [ref=e254]:
            - generic [ref=e255]:
              - img [ref=e256]
              - generic [ref=e259]:
                - generic [ref=e260]: 100%
                - generic [ref=e261]: Compliance Health
            - generic [ref=e262]:
              - heading "Quick Actions" [level=3] [ref=e263]
              - generic [ref=e264]:
                - button "View Alerts" [ref=e265] [cursor=pointer]:
                  - generic [ref=e266]:
                    - img [ref=e267]
                    - generic [ref=e270]: View Alerts
                  - img [ref=e272]
                - button "Check Deadlines" [ref=e274] [cursor=pointer]:
                  - generic [ref=e275]:
                    - img [ref=e276]
                    - generic [ref=e279]: Check Deadlines
                  - img [ref=e281]
                - button "Review Breaches" [ref=e283] [cursor=pointer]:
                  - generic [ref=e284]:
                    - img [ref=e285]
                    - generic [ref=e287]: Review Breaches
                  - img [ref=e289]
                - button "Regulatory Feed" [ref=e291] [cursor=pointer]:
                  - generic [ref=e292]:
                    - img [ref=e293]
                    - generic [ref=e297]: Regulatory Feed
                  - img [ref=e299]
            - generic [ref=e301]:
              - heading "Recent Activity" [level=3] [ref=e302]
              - generic [ref=e303]:
                - generic [ref=e308]:
                  - heading "Compliance scan completed" [level=4] [ref=e310]
                  - paragraph [ref=e311]: All checks passed
                  - time [ref=e312]: 2 hours ago
                - generic [ref=e317]:
                  - heading "New regulatory update" [level=4] [ref=e319]
                  - paragraph [ref=e320]: SRA Practice Standards amendment
                  - time [ref=e321]: 4 hours ago
                - generic [ref=e326]:
                  - heading "Breach report filed" [level=4] [ref=e328]
                  - paragraph [ref=e329]: Data protection incident logged
                  - time [ref=e330]: Yesterday
                - generic [ref=e335]:
                  - heading "Staff training completed" [level=4] [ref=e337]
                  - paragraph [ref=e338]: AML refresher — 3 staff members
                  - time [ref=e339]: Yesterday
                - generic [ref=e343]:
                  - heading "Chaser sent" [level=4] [ref=e345]
                  - paragraph [ref=e346]: Outstanding evidence request
                  - time [ref=e347]: 2 days ago
        - generic [ref=e348]:
          - img [ref=e350]
          - heading "Firm-Wide Risk Heatmap" [level=3] [ref=e352]
          - paragraph [ref=e353]: Firm-Wide Risk Heatmap is available on the Professional plan. Upgrade to unlock this feature for your firm.
          - button "Upgrade to Professional" [ref=e354] [cursor=pointer]
          - paragraph [ref=e355]: Starting at £700/month for 10-50 solicitors
        - generic [ref=e356]:
          - img [ref=e358]
          - heading "Multi-Department Views" [level=3] [ref=e360]
          - paragraph [ref=e361]: Multi-Department Views is available on the Professional plan. Upgrade to unlock this feature for your firm.
          - button "Upgrade to Professional" [ref=e362] [cursor=pointer]
          - paragraph [ref=e363]: Starting at £700/month for 10-50 solicitors
  - alert [ref=e364]
  - generic [ref=e365]: "3"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | /**
  4  |  * Workflow 6: Compliance dashboard.
  5  |  *
  6  |  * The dashboard hits THREE backend endpoints in parallel and renders
  7  |  * aggregated data. Tests:
  8  |  *   - All three fetches resolve with 2xx
  9  |  *   - The page renders without throwing (no React error boundary)
  10 |  *   - Key dashboard sections are visible
  11 |  *
  12 |  * Catches:
  13 |  *   - Any one of the three endpoints being broken
  14 |  *   - RLS context not propagating through aggregate queries
  15 |  *   - The "render after fetch" path silently breaking on empty data
  16 |  */
  17 | 
  18 | const REQUIRED_ENDPOINTS = [
  19 |   '/dashboard/stats',
  20 |   '/compliance/daily-briefing',
  21 |   '/compliance/regulatory-updates',
  22 | ];
  23 | 
  24 | test.describe('Dashboard', () => {
  25 |   test('dashboard loads all panels without errors', async ({ page }) => {
  26 |     // Auth comes from the shared storage state set up by auth.setup.ts.
  27 |     // Track that each expected endpoint resolves with 2xx (not 4xx/5xx).
  28 |     const resolved = new Set<string>();
  29 |     page.on('response', (resp) => {
  30 |       for (const ep of REQUIRED_ENDPOINTS) {
  31 |         if (resp.url().includes(ep) && resp.status() < 400) {
  32 |           resolved.add(ep);
  33 |         }
  34 |       }
  35 |     });
  36 | 
  37 |     // Catch unhandled page errors (React render failures, JS exceptions)
  38 |     const pageErrors: Error[] = [];
  39 |     page.on('pageerror', (err) => pageErrors.push(err));
  40 | 
  41 |     await page.goto('/dashboard');
  42 |     await page.waitForLoadState('networkidle');
  43 | 
  44 |     expect(
  45 |       pageErrors,
  46 |       `Page threw runtime errors: ${pageErrors.map((e) => e.message).join('; ')}`,
  47 |     ).toHaveLength(0);
  48 | 
  49 |     for (const ep of REQUIRED_ENDPOINTS) {
  50 |       expect(
  51 |         resolved.has(ep),
  52 |         `Dashboard never received a successful response from ${ep}. Either the endpoint is broken or the dashboard never called it.`,
> 53 |       ).toBe(true);
     |         ^ Error: Dashboard never received a successful response from /compliance/regulatory-updates. Either the endpoint is broken or the dashboard never called it.
  54 |     }
  55 | 
  56 |     // Sanity: verify the page actually rendered something dashboard-shaped.
  57 |     // Don't assert specific copy — too brittle — but assert SOME headings exist.
  58 |     const headingCount = await page.getByRole('heading').count();
  59 |     expect(headingCount, 'Dashboard should render at least one heading').toBeGreaterThan(0);
  60 |   });
  61 | });
  62 | 
```