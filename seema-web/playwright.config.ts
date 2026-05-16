import { defineConfig, devices } from '@playwright/test';

/**
 * Seema E2E test configuration.
 *
 * Tests assume:
 *   - The full Docker stack is running: `docker compose up -d`
 *   - The Node API is reachable at http://localhost:4000
 *   - The Next.js frontend is reachable at http://localhost:3000
 *
 * If you want Playwright to start the dev server itself, set
 *   PLAYWRIGHT_AUTOSTART=1
 * and uncomment the webServer block below. By default we trust that the
 * stack is already up so you can run tests against the same containers
 * the app actually deploys with.
 *
 * Run:
 *   npm run test:e2e               # headless
 *   npm run test:e2e:ui            # interactive UI
 *   npm run test:e2e:headed        # see the browser
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,            // workflows touch shared state (firms, matters)
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,                       // serial for the same reason as fullyParallel: false
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
  },
  projects: [
    // Setup project: registers + logs in a shared E2E user, saves storage.
    // Runs once before any tests; tests inherit storage via `dependencies`.
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Auto-load the shared auth state so tests start signed in.
        storageState: '.auth/storage.json',
      },
      dependencies: ['setup'],
    },
  ],
  // Uncomment to have Playwright start `npm run dev` itself:
  // webServer: process.env.PLAYWRIGHT_AUTOSTART
  //   ? {
  //       command: 'npm run dev',
  //       url: 'http://localhost:3000',
  //       timeout: 60_000,
  //       reuseExistingServer: !process.env.CI,
  //     }
  //   : undefined,
});
