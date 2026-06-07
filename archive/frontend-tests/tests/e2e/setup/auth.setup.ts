import { test as setup, expect } from '@playwright/test';
import { request } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Global auth setup — runs ONCE before any tests.
 *
 * Registers a single shared E2E firm + admin user via the API (no UI),
 * logs in via the UI to get the app's storage in a real signed-in state,
 * and saves that storage to disk. All other tests inherit it via the
 * `storageState` config in playwright.config.ts.
 *
 * This sidesteps the auth rate limiter (one register + one login total
 * per test run, instead of one per test) and makes tests ~5x faster.
 *
 * The shared user details are also written to a JSON sibling file so
 * tests can read the firmId/email if they need to assert on tenant scope.
 */

// __dirname = seema-web/tests/e2e/setup/. We want seema-web/.auth/.
// That's 3 levels up: setup → e2e → tests → seema-web.
const STORAGE_PATH = path.join(__dirname, '..', '..', '..', '.auth', 'storage.json');
const USER_PATH = path.join(__dirname, '..', '..', '..', '.auth', 'user.json');
const API_BASE = process.env.E2E_API_URL || 'http://localhost:4000/api';

setup('register + login shared E2E user', async ({ page }) => {
  fs.mkdirSync(path.dirname(STORAGE_PATH), { recursive: true });

  const stamp = Date.now();
  const email = `e2e-shared-${stamp}@seema-test.invalid`;
  const password = 'PlaywrightTest123!';
  const firmName = `E2E Shared Firm ${stamp}`;
  const sraNumber = `EE${stamp.toString().slice(-7)}`;

  // 1. Register via API (faster than UI, single call)
  const c = await request.newContext();
  const reg = await c.post(`${API_BASE}/auth/register`, {
    data: { email, password, firmName, sraNumber },
  });
  expect(reg.status(), `Register failed: ${await reg.text().catch(() => '')}`).toBeLessThan(300);
  const regBody = await reg.json();

  // 2. Log in via the UI so the app's own storage code populates localStorage
  //    in whatever shape it expects (we don't have to guess the keys).
  await page.goto('/login');
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);

  // Diagnostic: capture every login-related network call so failures are clear.
  const loginCalls: { url: string; status: number }[] = [];
  page.on('response', (resp) => {
    if (resp.url().includes('/auth/login')) {
      loginCalls.push({ url: resp.url(), status: resp.status() });
    }
  });

  // Diagnostic: capture browser console errors (CORS, network, JS) too.
  const consoleMsgs: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      consoleMsgs.push(`[${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => consoleMsgs.push(`[pageerror] ${err.message}`));

  await page.getByRole('button', { name: /^log in$|^sign in$/i }).click();

  // Wait for the app to redirect away from /login on successful auth.
  try {
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 15_000 });
  } catch (e) {
    // Setup failed — dump everything we captured so the next run is debuggable.
    console.error('\n=== auth.setup FAILED ===');
    console.error(`Login API calls observed: ${loginCalls.length}`);
    for (const c of loginCalls) {
      console.error(`  ${c.status} ${c.url}`);
    }
    console.error(`\nBrowser console messages: ${consoleMsgs.length}`);
    for (const m of consoleMsgs) {
      console.error(`  ${m}`);
    }
    console.error(`\nFinal URL: ${page.url()}`);
    const visibleErrorText = await page.locator('body').textContent({ timeout: 2_000 }).catch(() => '');
    console.error(`Visible body text (first 500 chars):\n${visibleErrorText?.slice(0, 500)}`);
    throw e;
  }

  // 3. Save Playwright's storage state (cookies + localStorage) to disk
  await page.context().storageState({ path: STORAGE_PATH });

  // 4. Save the user details for tests that need them
  fs.writeFileSync(
    USER_PATH,
    JSON.stringify({ email, password, firmId: regBody.firm_id, userId: regBody.id }, null, 2),
  );

  console.log(`[auth.setup] Shared E2E user registered: ${email} (firmId=${regBody.firm_id})`);
});
