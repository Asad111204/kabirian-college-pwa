import { defineConfig, devices } from '@playwright/test'

/**
 * Browser tests against the production harness.
 *
 * The server is not started here: `node tests/harness/run.mjs --playwright`
 * brings up the throwaway database and the production build, then runs
 * these. Two projects cover the responsive matrix — a phone and a desktop —
 * and every spec runs on both.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  workers: 2,
  /**
   * One retry locally as well as in CI. Two navigation waits have been seen
   * to time out on this machine when the unit suite was running at the same
   * time - the page had loaded and the test had given up, with nothing wrong
   * in the application. A retry tells a slow machine apart from a real
   * failure; anything that fails twice is real.
   */
  retries: 1,
  timeout: 45_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3002',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'phone', use: { ...devices['Pixel 5'] } },
  ],
})
