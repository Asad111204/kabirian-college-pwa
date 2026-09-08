import { expect, test } from '@playwright/test'
import { expectNoHorizontalOverflow, isPhone, signIn } from './helpers'

/**
 * The responsive matrix: the pages people open most, on a phone and a
 * desktop. The rule is simple — nothing ever scrolls sideways, and on a
 * phone the navigation lives in a drawer that opens from the top bar.
 */
const PAGES: Record<'admin' | 'teacher' | 'student', string[]> = {
  admin: ['/admin', '/admin/students', '/admin/staff', '/admin/staff-attendance', '/admin/staff-attendance/month', '/admin/users', '/admin/attendance', '/admin/exams', '/admin/timetable', '/admin/notices', '/admin/complaints', '/admin/reports', '/admin/audit', '/admin/settings', '/account/devices'],
  teacher: ['/staff', '/staff/profile', '/staff/attendance', '/staff/exams', '/staff/timetable', '/staff/notices', '/staff/students'],
  student: ['/student', '/student/attendance', '/student/results', '/student/notices', '/student/events', '/student/complaints'],
}

for (const [who, paths] of Object.entries(PAGES) as [keyof typeof PAGES, string[]][]) {
  test(`${who}: no page scrolls sideways`, async ({ page }) => {
    await signIn(page, who)
    for (const path of paths) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 }), path).toBeVisible()
      await expectNoHorizontalOverflow(page, path)
    }
  })
}

test('the sign-in page fits a phone and a desktop', async ({ page }) => {
  await page.goto('/login')
  await expectNoHorizontalOverflow(page)
})

test('on a phone the navigation is a drawer; on a desktop it is a sidebar', async ({ page }) => {
  await signIn(page, 'admin')
  await page.goto('/admin')
  // The dashboard's quick actions link to Students too; the navigation lives in an <aside>.
  const sidebarLink = page.locator('aside').first().getByRole('link', { name: 'Students', exact: true })
  if (isPhone(page)) {
    await expect(sidebarLink).toBeHidden()
    await page.getByRole('button', { name: 'Open menu' }).click()
    const drawerLink = page.locator('aside').last().getByRole('link', { name: 'Students', exact: true })
    await expect(drawerLink).toBeVisible()
    await drawerLink.click()
    await expect(page).toHaveURL(/\/admin\/students$/)
    // Tapping a link closes the drawer.
    await expect(page.getByRole('button', { name: 'Close menu' }).first()).toBeHidden()
  } else {
    await expect(sidebarLink).toBeVisible()
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeHidden()
  }
})
