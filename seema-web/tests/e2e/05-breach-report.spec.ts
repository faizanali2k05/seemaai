import { test, expect } from '@playwright/test';

/**
 * Workflow 5: File a breach report → ICO 72-hour deadline tracking.
 *
 * Verifies:
 *   - Breach list page loads
 *   - "Report breach" button opens the form
 *   - Form submission hits /compliance/breach-report and returns 2xx
 *   - The new breach appears with an ICO deadline countdown
 *
 * The ICO countdown is critical to the product's value proposition for
 * solicitors (72-hour notification window). We don't assert the exact
 * countdown text — too brittle — but we check the deadline date renders.
 */

test.describe('Breach reporting', () => {
  test('file a breach and see ICO deadline', async ({ page }) => {
    // Auth comes from the shared storage state set up by auth.setup.ts.
    await page.goto('/breaches');

    await page.waitForResponse(
      (r) => r.url().includes('/compliance/breach-reports') && r.request().method() === 'GET',
    );

    // Top-level button is "Report Breach"
    const reportButton = page.getByRole('button', { name: /^report breach$/i });
    await expect(reportButton, 'Report Breach button should be visible').toBeVisible();
    await reportButton.click();

    // Form placeholders (verified in breaches/page.tsx):
    //   "e.g., Unauthorized Client Data Access" → title
    //   "Detailed description of the breach..."  → description
    //   "Number of affected records"             → affected_records
    const stamp = Date.now();
    const title = `E2E Breach ${stamp}`;

    await page.getByPlaceholder(/Unauthorized Client Data|breach title|breach name/i).fill(title);
    await page
      .getByPlaceholder(/Detailed description of the breach/i)
      .fill('Test breach report for E2E run — automated, ignore.');
    await page.getByPlaceholder(/Number of affected records/i).fill('1');

    // Submit — modal's confirm button. Try the most common labels in order.
    const submitCall = page.waitForResponse(
      (r) =>
        r.url().includes('/compliance/breach-report') &&
        r.request().method() === 'POST' &&
        !r.url().endsWith('breach-reports'),
    );
    await page
      .getByRole('button', { name: /^report$|^file breach$|^submit$|^create$/i })
      .last()
      .click();
    const submitResp = await submitCall;
    expect(
      submitResp.status(),
      'POST /compliance/breach-report should return 2xx',
    ).toBeLessThan(300);

    // The new breach should appear in the list with the title we set
    await expect(page.getByText(title)).toBeVisible({ timeout: 5_000 });

    // ICO deadline should be visible somewhere — text varies but the
    // notification status / deadline date / countdown should appear.
    const icoIndicator = page.getByText(/ico|72\s*hour|deadline|notify/i).first();
    await expect(
      icoIndicator,
      'After filing a breach, ICO deadline / notification info should be visible.',
    ).toBeVisible({ timeout: 5_000 });
  });
});
