import { describe, expect, it } from 'vitest'
import {
  NOTIFICATION_KINDS,
  NOTIFICATION_KIND_LABEL,
  NOTIFICATION_KIND_PATHS,
  badgeCount,
  countFor,
  hasDotFor,
  isInternalLink,
  totalUnread,
} from '@/server/notifications/notifications-policy'

/**
 * Phase 27. Which button wears a red dot, what the app icon says, and the one
 * rule that keeps a notification from being a way off the site.
 */
describe('which button wears the dot', () => {
  const unread = { HOMEWORK: 3, COMPLAINT: 1 }

  it('lights the button the unread thing belongs to, in the portal it belongs to', () => {
    expect(hasDotFor('/student/homework', unread)).toBe(true)
    expect(hasDotFor('/staff/homework', unread)).toBe(true)
    expect(hasDotFor('/student/complaints', unread)).toBe(true)
    expect(hasDotFor('/admin/complaints', unread)).toBe(true)
  })

  it('leaves every other button alone', () => {
    expect(hasDotFor('/student/notices', unread)).toBe(false)
    expect(hasDotFor('/admin/students', unread)).toBe(false)
    expect(hasDotFor('/staff/timetable', unread)).toBe(false)
  })

  it('counts what belongs to that button, not everything', () => {
    expect(countFor('/student/homework', unread)).toBe(3)
    expect(countFor('/student/complaints', unread)).toBe(1)
    expect(countFor('/student/notices', unread)).toBe(0)
  })

  it('adds up two kinds that share a button', () => {
    // A student's results page carries both the exam news and the results.
    expect(countFor('/student/results', { EXAM: 2, RESULT: 1 })).toBe(3)
  })

  it('shows nothing at all when nothing is unread', () => {
    expect(hasDotFor('/student/homework', {})).toBe(false)
    expect(totalUnread({})).toBe(0)
  })
})

describe('the number on the app icon', () => {
  it('is what is unread, everywhere', () => {
    expect(totalUnread({ HOMEWORK: 3, NOTICE: 2, FEE: 1 })).toBe(6)
    expect(badgeCount(6)).toBe(6)
  })

  it('stops at ninety-nine, because nobody can read a smaller number than that', () => {
    expect(badgeCount(140)).toBe(99)
    expect(badgeCount(99)).toBe(99)
  })

  it('is nothing when there is nothing, and never negative', () => {
    expect(badgeCount(0)).toBe(0)
    expect(badgeCount(-4)).toBe(0)
    expect(badgeCount(Number.NaN)).toBe(0)
  })
})

describe('where a notification may lead', () => {
  it('accepts a path inside this app', () => {
    expect(isInternalLink('/student/homework/abc')).toBe(true)
    expect(isInternalLink('/admin')).toBe(true)
  })

  it('refuses anything that would leave the site', () => {
    expect(isInternalLink('https://example.com')).toBe(false)
    expect(isInternalLink('//example.com')).toBe(false)
    expect(isInternalLink('javascript:alert(1)')).toBe(false)
    expect(isInternalLink('')).toBe(false)
  })
})

describe('the small print', () => {
  it('names every kind in words, and gives each somewhere to point', () => {
    for (const kind of NOTIFICATION_KINDS) {
      expect(NOTIFICATION_KIND_LABEL[kind]).toBeTruthy()
      expect(NOTIFICATION_KIND_PATHS[kind].length).toBeGreaterThan(0)
      for (const path of NOTIFICATION_KIND_PATHS[kind]) expect(isInternalLink(path)).toBe(true)
    }
  })
})
