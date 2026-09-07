import { expect, test } from '@playwright/test'
import { signIn } from './helpers'

/**
 * The app as an app: the manifest, the service worker, the offline banner,
 * the API that fails fast, and the offline page the worker serves when the
 * network is gone. Runs on both projects; the worker checks need a real
 * browser, which is why they are here and not in vitest.
 */
test('the page links a manifest with icons and shortcuts', async ({ page }) => {
  await page.goto('/login')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBeTruthy()
  const manifest = await (await page.request.get(href!)).json()
  expect(manifest.display).toBe('standalone')
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true)
  expect(manifest.shortcuts.map((s: { url: string }) => s.url)).toContain('/go/attendance')
})

test('the service worker installs and controls the page', async ({ page }) => {
  await signIn(page, 'student')
  await page.goto('/student')
  const scope = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    return reg.scope
  })
  expect(scope).toMatch(/\/$/)
  await page.reload()
  const controlled = await page.evaluate(async () => {
    await navigator.serviceWorker.ready
    return navigator.serviceWorker.controller !== null
  })
  expect(controlled).toBe(true)
})

test('going offline shows the banner and the API fails at once', async ({ page, context }) => {
  await signIn(page, 'student')
  await page.goto('/student')
  await expect(page.getByText('You are offline.')).toHaveCount(0)
  await context.setOffline(true)
  await expect(page.getByRole('status').filter({ hasText: 'You are offline' })).toBeVisible()
  const started = Date.now()
  const result = await page.evaluate(async () => {
    try {
      await fetch('/api/v1/me/sessions')
      return 'ok'
    } catch {
      return 'failed'
    }
  })
  expect(result).toBe('failed')
  expect(Date.now() - started).toBeLessThan(5000)
  await context.setOffline(false)
  await expect(page.getByRole('status').filter({ hasText: 'You are offline' })).toHaveCount(0)
})

test('with the network gone, a page load shows the offline page from the worker', async ({ page, context }) => {
  await signIn(page, 'student')
  await page.goto('/student')
  // The worker must be installed *and* controlling this page before the
  // network goes: the first load of a fresh profile is never controlled.
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await context.setOffline(true)
  await page.goto('/student/notices', { waitUntil: 'commit' }).catch(() => undefined)
  await expect(page.getByRole('heading', { name: 'You are offline' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  await context.setOffline(false)
})

test('the worker never caches a page or the API', async ({ page }) => {
  await signIn(page, 'student')
  await page.goto('/student')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.goto('/student/notices')
  await page.evaluate(() => fetch('/api/v1/me/sessions').then((r) => r.json()))
  const cached = await page.evaluate(async () => {
    const names = await caches.keys()
    const urls: string[] = []
    for (const name of names) {
      const cache = await caches.open(name)
      for (const req of await cache.keys()) urls.push(new URL(req.url).pathname)
    }
    return urls
  })
  expect(cached.length).toBeGreaterThan(0)
  expect(cached.filter((u) => u.startsWith('/api/'))).toEqual([])
  expect(cached.filter((u) => u.startsWith('/student') || u.startsWith('/admin') || u.startsWith('/staff'))).toEqual([])
  expect(cached).toContain('/~offline')
})
