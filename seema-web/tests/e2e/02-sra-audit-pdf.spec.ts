import { test, expect } from '@playwright/test';
import { API_BASE } from './helpers/api';

/**
 * Workflow 2: SRA Audit page → Generate PDF Pack.
 *
 * THE flow you specifically flagged. Verifies:
 *   (a) The audit page renders without 500ing on its initial fetch
 *       (was broken before this session — the GET /compliance/sra-audit
 *       endpoint had no Node proxy)
 *   (b) The "Generate Pack" button calls the right backend URL
 *       (was broken before this session — the POST /compliance/sra-audit/generate-pack
 *       endpoint had no Node proxy)
 *   (c) The button opens a window with the rendered HTML pack
 *
 * The browser opening a popup makes this trickier than a normal click —
 * we listen for the popup event explicitly.
 */

test.describe('SRA audit + PDF pack generation', () => {
  test('audit page loads + generate pack button works', async ({ page, context }) => {
    // Auth comes from the shared storage state set up by auth.setup.ts.

    // --- Visit the SRA audit page ---
    const auditFetch = page.waitForResponse(
      (r) => r.url().includes('/compliance/sra-audit') && r.request().method() === 'GET',
    );
    await page.goto('/sra-audit');
    const auditResp = await auditFetch;
    expect(
      auditResp.status(),
      'GET /compliance/sra-audit should resolve, not 404. If this fails, the proxy in seema-node/src/routes/aiProxy.ts is missing.',
    ).toBeLessThan(400);

    // --- Click "Generate Pack" ---
    const generateButton = page.getByRole('button', { name: /generate pack|generate audit pack|generate sra pack/i });
    await expect(generateButton, 'Generate Pack button should be visible').toBeVisible();

    // The button opens a popup AND fires the API call. Capture both.
    const popupPromise = context.waitForEvent('page');
    const generateCall = page.waitForResponse(
      (r) =>
        r.url().includes('/compliance/sra-audit/generate-pack') &&
        r.request().method() === 'POST',
    );

    await generateButton.click();

    const generateResp = await generateCall;
    expect(
      generateResp.status(),
      'POST /compliance/sra-audit/generate-pack should resolve. If this 404s, the proxy in aiProxy.ts is missing or the URL is wrong.',
    ).toBeLessThan(400);

    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    // The pack is rendered as HTML in the popup; verify some content is there.
    const popupBody = await popup.content();
    expect(popupBody.length, 'popup should contain rendered pack HTML').toBeGreaterThan(500);
  });
});
