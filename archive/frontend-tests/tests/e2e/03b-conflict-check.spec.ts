import { test, expect } from '@playwright/test';

/**
 * Workflow 3b: Run a conflict check via the conflicts page.
 *
 * Verifies:
 *   - Conflicts list endpoint resolves
 *   - "New conflict check" button opens the form and submits
 *   - The check appears in the list afterwards with a status
 */

test.describe('Conflict check', () => {
  test('run a conflict check via UI', async ({ page }) => {
    // Auth comes from the shared storage state set up by auth.setup.ts.
    await page.goto('/conflicts');

    // Initial fetch
    await page.waitForResponse(
      (r) => r.url().includes('/compliance/conflicts') && r.request().method() === 'GET',
    );

    // Top-level button is "Run Conflict Check" (default tab is checks).
    const newCheckButton = page.getByRole('button', { name: /run conflict check/i });
    await expect(newCheckButton, 'Run Conflict Check button should be visible').toBeVisible();
    await newCheckButton.click();

    // Form has placeholder "e.g., Acme Corporation" for the client/party name field.
    const stamp = Date.now();
    const clientName = `E2E Conflict ${stamp}`;
    await page.getByPlaceholder(/Acme Corporation|client name/i).fill(clientName);

    const checkCall = page.waitForResponse(
      (r) =>
        r.url().includes('/compliance/conflicts/check') &&
        r.request().method() === 'POST',
    );
    // Modal submit button is exactly "Run Check" (or "Checking..." when loading).
    await page
      .getByRole('button', { name: /^run check$/i })
      .last()
      .click();
    const checkResp = await checkCall;
    expect(
      checkResp.status(),
      'POST /compliance/conflicts/check should return 2xx',
    ).toBeLessThan(300);

    // The new check should appear with the client name
    await expect(page.getByText(clientName)).toBeVisible({ timeout: 5_000 });
  });
});
