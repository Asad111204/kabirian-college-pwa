import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Page } from '@playwright/test'

/**
 * Shared bits for the browser tests. The fixtures come from the harness
 * seeds (tests/harness/seed.mjs writes ids.json), so the same accounts and
 * records the API checks use are the ones the browser sees.
 */
// Playwright transpiles these to CommonJS, so no import.meta: the harness runs us from the project root.
export const ids = JSON.parse(readFileSync(join(process.cwd(), 'tests/harness/ids.json'), 'utf8')) as {
  password: string
  session: string
  student: string
  weekday: string
}

export const USERS = {
  admin: 'harness.admin',
  teacher: 'harness.teacher.a',
  student: 'harness.student',
} as const

/** Signs in through the API; the cookie lands in the page's browser context. */
export async function signIn(page: Page, who: keyof typeof USERS): Promise<void> {
  const res = await page.request.post('/api/v1/auth/login', {
    data: { username: USERS[who], password: ids.password },
    headers: { origin: process.env.E2E_BASE_URL ?? 'http://localhost:3002' },
  })
  expect(res.ok(), `sign in as ${who}`).toBeTruthy()
}

/** The page must never scroll sideways, whatever the viewport. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(overflow.scrollWidth, `page is ${overflow.scrollWidth}px wide in a ${overflow.clientWidth}px viewport`).toBeLessThanOrEqual(overflow.clientWidth + 1)
}

export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1280) < 1024
