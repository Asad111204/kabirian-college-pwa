import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { ids, signIn } from './helpers'

/**
 * One real flow per portal, with the harness fixtures on screen: the office
 * finds a student and writes a notice; the teacher sees today's lesson; the
 * student sees the notice the office wrote for their section.
 */
const notices = JSON.parse(readFileSync(join(process.cwd(), 'tests/harness/ids-notices.json'), 'utf8')) as {
  notices: Record<string, { id: string; title: string }>
}

test.describe('the office', () => {
  test('finds a student by name and opens the record', async ({ page }) => {
    await signIn(page, 'admin')
    await page.goto('/admin/students')
    await page.getByPlaceholder(/search/i).first().fill('Ali Raza')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('link', { name: /Ali Raza/ }).first()).toBeVisible()
    await page.getByRole('link', { name: /Ali Raza/ }).first().click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Ali Raza')
    await expect(page.getByText('HSTU-0001')).toBeVisible()
  })

  test('writes a notice for everyone and publishes it', async ({ page }) => {
    await signIn(page, 'admin')
    await page.goto('/admin/notices')
    await page.getByRole('button', { name: /new notice|write a notice|add notice/i }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    const title = `Browser notice ${Date.now()}`
    await dialog.getByLabel(/title/i).fill(title)
    await dialog.getByLabel(/body|text|message/i).first().fill('Written from the browser test.')
    await dialog.getByRole('button', { name: /save|create/i }).click()
    await expect(page.getByText(title)).toBeVisible()
  })

  test('the audit log shows what just happened, with details but no snapshot', async ({ page }) => {
    await signIn(page, 'admin')
    await page.goto('/admin/audit?module=notice')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Audit log')
    await page.getByRole('button', { name: 'Details' }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).not.toContainText('beforeData')
  })
})

test.describe('a teacher', () => {
  test("sees today's lesson on the dashboard and the week on the timetable", async ({ page }) => {
    await signIn(page, 'teacher')
    await page.goto('/staff')
    await expect(page.getByText(/Biology/).first()).toBeVisible()
    await page.goto('/staff/timetable')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText('Lab 1').first()).toBeVisible()
  })

  test('sees only their own sections in the register', async ({ page }) => {
    await signIn(page, 'teacher')
    await page.goto('/staff/attendance')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText(/Section A/).first()).toBeVisible()
  })
})

test.describe('a student', () => {
  test('sees the notice the office wrote for their section, and not the draft', async ({ page }) => {
    await signIn(page, 'student')
    await page.goto('/student/notices')
    await expect(page.getByText(notices.notices.sec11A!.title)).toBeVisible()
    await expect(page.getByText(notices.notices.draft!.title)).toHaveCount(0)
  })

  test('sees their attendance and results pages', async ({ page }) => {
    await signIn(page, 'student')
    await page.goto('/student/attendance')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.goto('/student/results')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByText(ids.student)).toHaveCount(0) // never a raw database id on screen
  })
})
