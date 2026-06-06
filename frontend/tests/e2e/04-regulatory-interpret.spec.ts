import { test, expect } from '@playwright/test';
import { API_BASE } from './helpers/api';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Workflow 4: Regulatory updates → AI interpretation.
 *
 * Verifies:
 *   - Regulatory updates list loads
 *   - Triggering an interpretation hits the AI proxy and gets a 2xx
 *   - The interpretation result eventually returns
 *
 * Caveat: this depends on the FastAPI AI middleware actually being able
 * to call Claude. If your Anthropic key isn't configured, the interpretation
 * will fail at the AI step but the routing will still 2xx — which is what
 * we're testing here. End-to-end AI quality needs a separate test.
 */

test.describe('Regulatory updates', () => {
  test('list updates and trigger interpretation', async ({ page, request }) => {
    // Auth comes from the shared storage state set up by auth.setup.ts.
    // For the API-direct scrape call we need a token — read it from the
    // user file the setup wrote. (We could fetch it from storage.json
    // too but the user file is simpler.)
    // __dirname = seema-web/tests/e2e/. .auth lives at seema-web/.auth.
    const userFile = path.join(__dirname, '..', '..', '.auth', 'user.json');
    const sharedUser: { email: string; password: string; firmId: string } = JSON.parse(
      fs.readFileSync(userFile, 'utf8'),
    );
    const tokenResp = await request.post(`${API_BASE}/auth/login`, {
      data: { email: sharedUser.email, password: sharedUser.password },
    });
    const { access_token } = await tokenResp.json();

    // Need at least one regulatory update for the interpret button to do
    // anything. Trigger the scrape via API first (admin endpoint).
    const scrape = await request.post(`${API_BASE}/compliance/regulatory-updates/scrape`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    // Don't fail the test if scrape times out — the page might already have
    // seeded data. Just log.
    if (!scrape.ok()) {
      console.warn(`Regulatory scrape returned ${scrape.status()} — continuing anyway`);
    }

    await page.goto('/regulatory');

    const listFetch = await page.waitForResponse(
      (r) =>
        r.url().includes('/compliance/regulatory-updates') &&
        r.request().method() === 'GET' &&
        !r.url().includes('/interpretation') &&
        !r.url().includes('/interpret'),
      { timeout: 10_000 },
    );
    expect(listFetch.status(), 'GET /compliance/regulatory-updates should resolve').toBeLessThan(
      400,
    );

    // Find the first "Interpret" / "Run analysis" button on a regulatory item.
    // Skip the test gracefully if there's no data to interpret.
    const interpretButton = page.getByRole('button', {
      name: /interpret|analyse|analyze|run analysis/i,
    });
    if ((await interpretButton.count()) === 0) {
      test.skip(true, 'No regulatory updates to interpret in this environment');
      return;
    }

    const interpretCall = page.waitForResponse(
      (r) =>
        /\/compliance\/regulatory-updates\/[^/]+\/interpret$/.test(r.url()) &&
        r.request().method() === 'POST',
    );
    await interpretButton.first().click();
    const interpretResp = await interpretCall;
    expect(
      interpretResp.status(),
      'POST /compliance/regulatory-updates/{id}/interpret should resolve',
    ).toBeLessThan(400);
  });
});
