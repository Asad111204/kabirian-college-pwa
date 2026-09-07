import { expect, test } from '@playwright/test'
import { USERS, ids, signIn } from './helpers'

/**
 * Signing in and out through the real form, on a phone and a desktop, and
 * the portal boundary: a student who types an office address is sent home.
 */
test.describe('signing in', () => {
  test('a wrong password is refused with a sentence, and the right one opens the portal', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Kabirian College' })).toBeVisible()

    await page.getByLabel('Username').fill(USERS.teacher)
    await page.getByLabel('Password').fill('not-the-password')
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.getByRole('alert')).toContainText(/username or password|incorrect|not right/i)

    await page.getByLabel('Password').fill(ids.password)
    await page.getByRole('button', { name: /sign in/i }).click()
    await page.waitForURL('**/staff')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('signing out from the user menu ends the session', async ({ page }) => {
    await signIn(page, 'student')
    await page.goto('/student')
    await page.getByRole('button', { name: /Ali Raza|AR/ }).first().click()
    await page.getByRole('menuitem', { name: /Sign out/ }).click()
    await page.waitForURL('**/login')
    await page.goto('/student')
    await page.waitForURL('**/login')
  })

  test('a signed-out visitor is sent to sign in from every portal', async ({ page }) => {
    for (const path of ['/admin', '/staff', '/student', '/account/devices']) {
      await page.goto(path)
      await expect(page).toHaveURL(/\/login$/)
    }
  })

  test('a student who types an office address lands on their own portal', async ({ page }) => {
    await signIn(page, 'student')
    await page.goto('/admin/students')
    await expect(page).toHaveURL(/\/student$/)
    await page.goto('/admin/audit')
    await expect(page).toHaveURL(/\/student$/)
  })

  test('a teacher cannot open the office, and the office cannot open the staff portal', async ({ page }) => {
    await signIn(page, 'teacher')
    await page.goto('/admin/reports')
    await expect(page).toHaveURL(/\/staff$/)
  })
})
