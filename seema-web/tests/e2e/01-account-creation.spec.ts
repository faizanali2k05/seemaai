import { test, expect } from '@playwright/test';
import { API_BASE } from './helpers/api';

/**
 * Workflow 1: Register → Login → Onboarding completion.
 *
 * Drives the actual UI for register and login (since those are the most
 * common sources of "button doesn't work" bugs). Onboarding-complete is
 * verified at the API level because the wizard is multi-step and would
 * be a brittle UI test — what matters is that the endpoint responds.
 *
 * This test deliberately starts UNAUTHENTICATED (overriding the shared
 * storage state) so we can exercise the real register/login flow.
 */

// Force empty storage so the page starts logged out
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Account creation flow', () => {
  test('register → login → onboarding completes', async ({ page, request }) => {
    const stamp = Date.now();
    const email = `e2e-acct-${stamp}@seema-test.invalid`;
    const password = 'PlaywrightTest123!';
    const firmName = `Acct Test Firm ${stamp}`;
    const sraNumber = `ACCT${stamp.toString().slice(-6)}`;

    // --- Register via UI ---
    await page.goto('/register');
    // Be specific — the page has both an h1 ("Seema") and an h2
    // ("Create Account"); use the form-level heading so it's unambiguous.
    await expect(page.getByRole('heading', { name: /create account|sign up|register/i })).toBeVisible();

    // Use name= attribute selectors — these are unambiguous, unlike
    // label-based selectors which collide (the "Show password" button has
    // aria-label="Show password", and "Confirm Password" matches /firm/).
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('input[name="confirm_password"]').fill(password);
    await page.locator('input[name="firm_name"]').fill(firmName);
    await page.locator('input[name="sra_number"]').fill(sraNumber);

    const registerCall = page.waitForResponse(
      (r) => r.url().includes('/auth/register') && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /register|sign up|create account/i }).click();
    const regResp = await registerCall;
    expect(regResp.status(), 'register endpoint should return 2xx').toBeLessThan(300);

    // --- Login via UI (some apps auto-login; if so, this re-asserts the state) ---
    if (!page.url().includes('/dashboard') && !page.url().includes('/onboarding')) {
      await page.goto('/login');
      await page.getByLabel(/email/i).fill(email);
      await page.getByLabel(/password/i).fill(password);

      const loginCall = page.waitForResponse(
        (r) => r.url().includes('/auth/login') && r.request().method() === 'POST',
      );
      await page.getByRole('button', { name: /log in|sign in/i }).click();
      const loginResp = await loginCall;
      expect(loginResp.status(), 'login endpoint should return 2xx').toBeLessThan(300);
    }

    // --- Onboarding-complete via API ---
    // Multi-step wizard would be brittle to drive; the underlying endpoint
    // is what matters. Use the access token we got from the login response.
    const tokenResp = await request.post(`${API_BASE}/auth/login`, {
      data: { email, password },
    });
    const { access_token } = await tokenResp.json();
    expect(access_token, 'login should return access_token').toBeTruthy();

    const onboard = await request.post(`${API_BASE}/onboarding/complete`, {
      headers: { Authorization: `Bearer ${access_token}` },
      data: {
        sraNumber,
        firmName,
        practiceAreas: ['Litigation'],
        firmSize: 'Solo',
        acceptTerms: true,
      },
    });
    expect(onboard.status(), 'onboarding/complete should return 2xx').toBeLessThan(300);
  });
});
