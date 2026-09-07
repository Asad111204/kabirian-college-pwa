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
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
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
