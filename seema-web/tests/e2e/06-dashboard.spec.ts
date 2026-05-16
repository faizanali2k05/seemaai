import { test, expect } from '@playwright/test';

/**
 * Workflow 6: Compliance dashboard.
 *
 * The dashboard hits THREE backend endpoints in parallel and renders
 * aggregated data. Tests:
 *   - All three fetches resolve with 2xx
 *   - The page renders without throwing (no React error boundary)
 *   - Key dashboard sections are visible
 *
 * Catches:
 *   - Any one of the three endpoints being broken
 *   - RLS context not propagating through aggregate queries
 *   - The "render after fetch" path silently breaking on empty data
 */

const REQUIRED_ENDPOINTS = [
  '/dashboard/stats',
  '/compliance/daily-briefing',
  '/compliance/regulatory-updates',
];

test.describe('Dashboard', () => {
  test('dashboard loads all panels without errors', async ({ page }) => {
    // Auth comes from the shared storage state set up by auth.setup.ts.
    // Track that each expected endpoint resolves with 2xx (not 4xx/5xx).
    const resolved = new Set<string>();
    page.on('response', (resp) => {
      for (const ep of REQUIRED_ENDPOINTS) {
        if (resp.url().includes(ep) && resp.status() < 400) {
          resolved.add(ep);
        }
      }
    });

    // Catch unhandled page errors (React render failures, JS exceptions)
    const pageErrors: Error[] = [];
    page.on('pageerror', (err) => pageErrors.push(err));

    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    expect(
      pageErrors,
      `Page threw runtime errors: ${pageErrors.map((e) => e.message).join('; ')}`,
    ).toHaveLength(0);

    for (const ep of REQUIRED_ENDPOINTS) {
      expect(
        resolved.has(ep),
        `Dashboard never received a successful response from ${ep}. Either the endpoint is broken or the dashboard never called it.`,
      ).toBe(true);
    }

    // Sanity: verify the page actually rendered something dashboard-shaped.
    // Don't assert specific copy — too brittle — but assert SOME headings exist.
    const headingCount = await page.getByRole('heading').count();
    expect(headingCount, 'Dashboard should render at least one heading').toBeGreaterThan(0);
  });
});
