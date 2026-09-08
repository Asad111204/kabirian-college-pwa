import { describe, expect, it } from 'vitest'
import { decideCanManageHomework, describeDue, isHomeworkVisible, type HomeworkViewer } from '@/server/homework/homework-policy'

/** Who may set homework and who may read it — each rule from both sides. */
const admin: HomeworkViewer = { role: 'ADMIN', staffId: null, canManage: true }
const teacher: HomeworkViewer = { role: 'STAFF', staffId: 'staff-1', canManage: true }
const other: HomeworkViewer = { role: 'STAFF', staffId: 'staff-2', canManage: true }
const student: HomeworkViewer = { role: 'STUDENT', staffId: null, canManage: false }

describe('decideCanManageHomework', () => {
  it('lets the assigned teacher set, change and remove their own piece', () => {
    expect(decideCanManageHomework(teacher, { hasActiveAssignment: true, ownerStaffId: null }).allowed).toBe(true)
    expect(decideCanManageHomework(teacher, { hasActiveAssignment: true, ownerStaffId: 'staff-1' }).allowed).toBe(true)
  })

  it('refuses a teacher without the assignment, with the reason', () => {
    const d = decideCanManageHomework(teacher, { hasActiveAssignment: false, ownerStaffId: null })
    expect(d.allowed).toBe(false)
    if (!d.allowed) expect(d.code).toBe('NOT_ASSIGNED')
  })

  it('refuses a colleague who also teaches the section but did not set the piece', () => {
    const d = decideCanManageHomework(other, { hasActiveAssignment: true, ownerStaffId: 'staff-1' })
    expect(d.allowed).toBe(false)
    if (!d.allowed) {
      expect(d.code).toBe('NOT_OWNER')
      expect(d.reason).toMatch(/another teacher/)
    }
  })

  it('lets the office do all of it, and nobody without the permission', () => {
    expect(decideCanManageHomework(admin, { hasActiveAssignment: false, ownerStaffId: 'staff-1' }).allowed).toBe(true)
    expect(decideCanManageHomework({ ...teacher, canManage: false }, { hasActiveAssignment: true, ownerStaffId: null }).allowed).toBe(false)
    expect(decideCanManageHomework(student, { hasActiveAssignment: true, ownerStaffId: null }).allowed).toBe(false)
    expect(decideCanManageHomework({ ...teacher, staffId: null }, { hasActiveAssignment: true, ownerStaffId: null }).allowed).toBe(false)
  })
})

describe('isHomeworkVisible', () => {
  const piece = { sectionId: 'sec-11A' }
  it('is read by the office, by the section’s students, and by the section’s teachers', () => {
    expect(isHomeworkVisible({ role: 'ADMIN', placementSectionId: null, scopedSectionIds: [] }, piece)).toBe(true)
    expect(isHomeworkVisible({ role: 'STUDENT', placementSectionId: 'sec-11A', scopedSectionIds: [] }, piece)).toBe(true)
    expect(isHomeworkVisible({ role: 'STAFF', placementSectionId: null, scopedSectionIds: ['sec-12B', 'sec-11A'] }, piece)).toBe(true)
  })

  it('is hidden from a student of another section, a student with no section, and a teacher of other sections', () => {
    expect(isHomeworkVisible({ role: 'STUDENT', placementSectionId: 'sec-11B', scopedSectionIds: [] }, piece)).toBe(false)
    expect(isHomeworkVisible({ role: 'STUDENT', placementSectionId: null, scopedSectionIds: [] }, piece)).toBe(false)
    expect(isHomeworkVisible({ role: 'STAFF', placementSectionId: null, scopedSectionIds: ['sec-11B'] }, piece)).toBe(false)
  })
})

describe('describeDue', () => {
  it('says how far away the date is, in the tone the screen colours it', () => {
    expect(describeDue('2026-09-08', '2026-09-08')).toEqual({ label: 'Due today', tone: 'warning' })
    expect(describeDue('2026-09-09', '2026-09-08')).toEqual({ label: 'Due tomorrow', tone: 'warning' })
    expect(describeDue('2026-09-15', '2026-09-08')).toEqual({ label: 'Due in 7 days', tone: 'neutral' })
    expect(describeDue('2026-09-07', '2026-09-08')).toEqual({ label: 'Was due yesterday', tone: 'danger' })
    expect(describeDue('2026-09-01', '2026-09-08')).toEqual({ label: 'Was due 7 days ago', tone: 'danger' })
    expect(describeDue(null, '2026-09-08')).toBeNull()
  })
})
