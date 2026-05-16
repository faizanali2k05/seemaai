import { test, expect } from '@playwright/test';

/**
 * Workflow 3a: Create a matter via the matters page.
 *
 * Verifies the matter creation flow: open create modal, fill form, submit,
 * see the new matter in the list. Catches the "create button does nothing"
 * class of bug.
 */

test.describe('Matter creation', () => {
  test('create matter via UI', async ({ page }) => {
    // Auth comes from the shared storage state set up by auth.setup.ts.
    await page.goto('/matters');

    // The list fetch should resolve (even if empty).
    await page.waitForResponse(
      (r) => r.url().includes('/compliance/matters') && r.request().method() === 'GET',
    );

    // The button is labelled "Create Checklist" in this app (not Matter).
    const createButton = page.getByRole('button', { name: /create checklist/i });
    await expect(createButton, 'Create Checklist button should be visible').toBeVisible();
    await createButton.click();

    // Form uses these placeholders (verified in matters/page.tsx):
    //   "e.g., CONV-2025-001"  → matter ref
    //   "e.g., Smith & Co Ltd" → client name
    //   "e.g., John Smith"     → fee earner
    const stamp = Date.now();
    const ref = `E2E-MAT-${stamp}`;
    const clientName = `E2E Client ${stamp}`;

    await page.getByPlaceholder(/CONV-\d|matter ref/i).fill(ref);
    await page.getByPlaceholder(/Smith & Co|client/i).fill(clientName);
    await page.getByPlaceholder(/John Smith|fee earner/i).fill('E2E Solicitor');

    const createCall = page.waitForResponse(
      (r) => r.url().includes('/compliance/matters') && r.request().method() === 'POST',
    );
    // The submit button text in the modal — try common variants.
    await page
      .getByRole('button', { name: /^create$|^save$|^submit$/i })
      .last()
      .click();
    const createResp = await createCall;
    expect(
      createResp.status(),
      'POST /compliance/matters should return 2xx. If 4xx, the form payload shape mismatches what the backend expects.',
    ).toBeLessThan(300);

    // The new matter should appear somewhere on the page.
    await expect(page.getByText(clientName)).toBeVisible({ timeout: 5_000 });
  });
});
