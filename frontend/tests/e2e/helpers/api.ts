/**
 * Tiny API helper for Playwright tests.
 *
 * We hit the backend directly (port 4000) for setup/teardown and for
 * fast token-based authentication. Browser-driven flows go through the
 * Next.js UI as normal.
 */
import { APIRequestContext, request } from '@playwright/test';

export const API_BASE = process.env.E2E_API_URL || 'http://localhost:4000/api';

export interface RegisteredUser {
  email: string;
  password: string;
  firmId: string;
  userId: string;
  accessToken: string;
}

let _ctx: APIRequestContext | null = null;
async function ctx(): Promise<APIRequestContext> {
  if (!_ctx) _ctx = await request.newContext();
  return _ctx;
}

/**
 * Register a fresh firm + admin user with a unique timestamped email so each
 * test run gets isolated data. Returns the credentials + initial token.
 */
export async function registerNewFirm(opts?: {
  firmName?: string;
  sraNumber?: string;
}): Promise<RegisteredUser> {
  const c = await ctx();
  const stamp = Date.now();
  const email = `e2e-${stamp}@seema-test.invalid`;
  const password = 'PlaywrightTest123!';
  const firmName = opts?.firmName ?? `E2E Firm ${stamp}`;
  // SRA numbers are unique — make sure ours doesn't collide across runs.
  const sraNumber = opts?.sraNumber ?? `E2E${stamp.toString().slice(-6)}`;

  const reg = await c.post(`${API_BASE}/auth/register`, {
    data: { email, password, firmName, sraNumber },
  });
  if (!reg.ok()) {
    throw new Error(`Register failed (${reg.status()}): ${await reg.text()}`);
  }
  const regBody = await reg.json();

  const login = await c.post(`${API_BASE}/auth/login`, {
    data: { email, password },
  });
  if (!login.ok()) {
    throw new Error(`Login failed (${login.status()}): ${await login.text()}`);
  }
  const loginBody = await login.json();

  return {
    email,
    password,
    firmId: regBody.firm_id,
    userId: regBody.id,
    accessToken: loginBody.access_token,
  };
}

/**
 * Log in via the actual UI flow.
 *
 * We tried localStorage injection — it's faster but brittle because we
 * have to guess every key the app might read (accessToken, refreshToken,
 * user-cache key, Zustand storage key, etc). Driving the real login form
 * means the app's own storage code runs and the page ends up in a state
 * the app trusts.
 *
 * If your login URL or selectors change, update them here once and every
 * test downstream keeps working.
 */
import { Page, expect } from '@playwright/test';
export async function loginAs(page: Page, user: RegisteredUser): Promise<void> {
  await page.goto('/login');
  // Use input[type=...] selectors — the label-based ones collide with
  // the "Show password" toggle button which also has an aria-label
  // matching /password/i.
  await page.locator('input[type="email"]').first().fill(user.email);
  await page.locator('input[type="password"]').first().fill(user.password);

  const loginCall = page.waitForResponse(
    (r) => r.url().includes('/auth/login') && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: /^log in$|^sign in$/i }).click();
  const resp = await loginCall;
  expect(
    resp.status(),
    `loginAs(${user.email}) failed at the API: ${resp.status()}`,
  ).toBeLessThan(300);

  // Wait until we're not on /login anymore — the app should redirect
  // to /dashboard or /onboarding after a successful login.
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10_000 });
}
