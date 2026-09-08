import { describe, expect, it } from 'vitest'
import {
  COMPLAINT_STATUSES,
  COMPLAINT_STATUS_LABEL,
  MAX_OPEN_COMPLAINTS,
  awaitingFor,
  awaitingOfficeAfter,
  decideCanReadComplaint,
  decideCanReplyToComplaint,
  decideCanSetComplaintStatus,
  decideCanSubmitComplaint,
  decideCanWithdrawComplaint,
  isComplaintOpen,
  nextStatusesFor,
  statusAfterOfficeReply,
  waitingDays,
  type ComplaintViewer,
} from '@/server/complaints/complaints-policy'

/**
 * Phase 23. The rule that matters most: an application is between the student
 * who wrote it and the office, and nobody else — a complaint may well be
 * about a teacher.
 */
const STUDENT_A = '66666666-6666-4666-8666-666666666661'
const STUDENT_B = '66666666-6666-4666-8666-666666666662'

const student = (id: string): ComplaintViewer => ({ role: 'STUDENT', studentId: id, canRead: false, canRespond: false })
const office: ComplaintViewer = { role: 'ADMIN', studentId: null, canRead: true, canRespond: true }
const officeReadOnly: ComplaintViewer = { role: 'ADMIN', studentId: null, canRead: true, canRespond: false }
const officeNoPermission: ComplaintViewer = { role: 'ADMIN', studentId: null, canRead: false, canRespond: false }
const teacher: ComplaintViewer = { role: 'STAFF', studentId: null, canRead: false, canRespond: false }
const teacherWithPermissions: ComplaintViewer = { role: 'STAFF', studentId: null, canRead: true, canRespond: true }

describe('who may read an application', () => {
  it('lets the student who wrote it, and the office, read it', () => {
    expect(decideCanReadComplaint(student(STUDENT_A), { studentId: STUDENT_A }).allowed).toBe(true)
    expect(decideCanReadComplaint(office, { studentId: STUDENT_A }).allowed).toBe(true)
  })

  it('refuses another student', () => {
    const decision = decideCanReadComplaint(student(STUDENT_B), { studentId: STUDENT_A })
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.code).toBe('NOT_YOURS')
  })

  it('refuses a teacher, even one holding both permissions', () => {
    // A complaint may be about a teacher. Holding the permission is not the
    // same as being the office.
    expect(decideCanReadComplaint(teacher, { studentId: STUDENT_A }).allowed).toBe(false)
    expect(decideCanReadComplaint(teacherWithPermissions, { studentId: STUDENT_A }).allowed).toBe(false)
  })

  it('refuses an administrator whose permission was taken away', () => {
    const decision = decideCanReadComplaint(officeNoPermission, { studentId: STUDENT_A })
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.code).toBe('NO_PERMISSION')
  })

  it('refuses a student login with no student record', () => {
    expect(decideCanReadComplaint({ role: 'STUDENT', studentId: null, canRead: false, canRespond: false }, { studentId: STUDENT_A }).allowed).toBe(false)
  })
})

describe('writing one', () => {
  it('is for students, not for the office or a teacher', () => {
    expect(decideCanSubmitComplaint(student(STUDENT_A), 0).allowed).toBe(true)
    expect(decideCanSubmitComplaint(office, 0).allowed).toBe(false)
    expect(decideCanSubmitComplaint(teacher, 0).allowed).toBe(false)
  })

  it('stops at a handful open at once, and says how many', () => {
    expect(decideCanSubmitComplaint(student(STUDENT_A), MAX_OPEN_COMPLAINTS - 1).allowed).toBe(true)
    const refused = decideCanSubmitComplaint(student(STUDENT_A), MAX_OPEN_COMPLAINTS)
    expect(refused.allowed).toBe(false)
    if (!refused.allowed) {
      expect(refused.code).toBe('TOO_MANY_OPEN')
      expect(refused.reason).toContain(String(MAX_OPEN_COMPLAINTS))
    }
  })
})

describe('adding to the exchange', () => {
  it('lets both sides write while it is open', () => {
    for (const status of ['SUBMITTED', 'IN_REVIEW'] as const) {
      expect(decideCanReplyToComplaint(student(STUDENT_A), { studentId: STUDENT_A, status }).allowed).toBe(true)
      expect(decideCanReplyToComplaint(office, { studentId: STUDENT_A, status }).allowed).toBe(true)
    }
  })

  it('refuses either side once it is resolved or withdrawn, and says which', () => {
    const resolved = decideCanReplyToComplaint(student(STUDENT_A), { studentId: STUDENT_A, status: 'RESOLVED' })
    expect(resolved.allowed).toBe(false)
    if (!resolved.allowed) {
      expect(resolved.code).toBe('ALREADY_CLOSED')
      expect(resolved.reason).toMatch(/resolved/)
    }
    const withdrawn = decideCanReplyToComplaint(office, { studentId: STUDENT_A, status: 'WITHDRAWN' })
    expect(withdrawn.allowed).toBe(false)
    if (!withdrawn.allowed) expect(withdrawn.reason).toMatch(/withdrawn/)
  })

  it('refuses an office reader who may look but not answer', () => {
    const decision = decideCanReplyToComplaint(officeReadOnly, { studentId: STUDENT_A, status: 'SUBMITTED' })
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.code).toBe('NO_PERMISSION')
  })

  it('refuses another student before it even looks at the state', () => {
    const decision = decideCanReplyToComplaint(student(STUDENT_B), { studentId: STUDENT_A, status: 'SUBMITTED' })
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) expect(decision.code).toBe('NOT_YOURS')
  })
})

describe('withdrawing', () => {
  it('is the student’s alone, and only while it is open', () => {
    expect(decideCanWithdrawComplaint(student(STUDENT_A), { studentId: STUDENT_A, status: 'SUBMITTED' }).allowed).toBe(true)
    expect(decideCanWithdrawComplaint(student(STUDENT_A), { studentId: STUDENT_A, status: 'IN_REVIEW' }).allowed).toBe(true)
    expect(decideCanWithdrawComplaint(student(STUDENT_A), { studentId: STUDENT_A, status: 'RESOLVED' }).allowed).toBe(false)
    expect(decideCanWithdrawComplaint(student(STUDENT_A), { studentId: STUDENT_A, status: 'WITHDRAWN' }).allowed).toBe(false)
  })

  it('is not the office’s, and not another student’s', () => {
    expect(decideCanWithdrawComplaint(office, { studentId: STUDENT_A, status: 'SUBMITTED' }).allowed).toBe(false)
    expect(decideCanWithdrawComplaint(student(STUDENT_B), { studentId: STUDENT_A, status: 'SUBMITTED' }).allowed).toBe(false)
  })
})

describe('where the office may move it', () => {
  it('offers the sensible next steps and refuses the rest', () => {
    expect(decideCanSetComplaintStatus(office, 'SUBMITTED', 'IN_REVIEW').allowed).toBe(true)
    expect(decideCanSetComplaintStatus(office, 'SUBMITTED', 'RESOLVED').allowed).toBe(true)
    expect(decideCanSetComplaintStatus(office, 'IN_REVIEW', 'RESOLVED').allowed).toBe(true)
    // An answer that turned out to be wrong is corrected on the same application.
    expect(decideCanSetComplaintStatus(office, 'RESOLVED', 'IN_REVIEW').allowed).toBe(true)
  })

  it('never withdraws on a student’s behalf, and never undoes a withdrawal', () => {
    expect(decideCanSetComplaintStatus(office, 'SUBMITTED', 'WITHDRAWN').allowed).toBe(false)
    expect(decideCanSetComplaintStatus(office, 'WITHDRAWN', 'IN_REVIEW').allowed).toBe(false)
    expect(nextStatusesFor('WITHDRAWN')).toEqual([])
  })

  it('says so when it is already in that state, rather than pretending to act', () => {
    const decision = decideCanSetComplaintStatus(office, 'IN_REVIEW', 'IN_REVIEW')
    expect(decision.allowed).toBe(false)
    if (!decision.allowed) {
      expect(decision.code).toBe('BAD_STATUS')
      expect(decision.reason).toContain(COMPLAINT_STATUS_LABEL.IN_REVIEW)
    }
  })

  it('is the office’s alone', () => {
    expect(decideCanSetComplaintStatus(student(STUDENT_A), 'SUBMITTED', 'RESOLVED').allowed).toBe(false)
    expect(decideCanSetComplaintStatus(officeReadOnly, 'SUBMITTED', 'RESOLVED').allowed).toBe(false)
    expect(decideCanSetComplaintStatus(teacherWithPermissions, 'SUBMITTED', 'RESOLVED').allowed).toBe(false)
  })
})

describe('whose move it is', () => {
  it('lands on the office when it arrives, and after anything the student adds', () => {
    expect(awaitingOfficeAfter('SUBMITTED')).toBe(true)
    expect(awaitingOfficeAfter('STUDENT_REPLIED')).toBe(true)
    expect(awaitingOfficeAfter('REOPENED')).toBe(true)
  })

  it('leaves the office once it has answered or closed it', () => {
    expect(awaitingOfficeAfter('OFFICE_REPLIED')).toBe(false)
    expect(awaitingOfficeAfter('RESOLVED')).toBe(false)
    expect(awaitingOfficeAfter('WITHDRAWN')).toBe(false)
  })

  it('is nobody’s once it is closed, whatever the flag says', () => {
    expect(awaitingFor({ status: 'SUBMITTED', awaitingOffice: true })).toBe('OFFICE')
    expect(awaitingFor({ status: 'IN_REVIEW', awaitingOffice: false })).toBe('STUDENT')
    expect(awaitingFor({ status: 'RESOLVED', awaitingOffice: true })).toBeNull()
    expect(awaitingFor({ status: 'WITHDRAWN', awaitingOffice: true })).toBeNull()
  })

  it('takes a new application off the unread pile when the office answers it', () => {
    expect(statusAfterOfficeReply('SUBMITTED')).toBe('IN_REVIEW')
    expect(statusAfterOfficeReply('IN_REVIEW')).toBe('IN_REVIEW')
  })
})

describe('the small print', () => {
  it('knows which states are still open', () => {
    expect(isComplaintOpen('SUBMITTED')).toBe(true)
    expect(isComplaintOpen('IN_REVIEW')).toBe(true)
    expect(isComplaintOpen('RESOLVED')).toBe(false)
    expect(isComplaintOpen('WITHDRAWN')).toBe(false)
  })

  it('names every state in words', () => {
    for (const status of COMPLAINT_STATUSES) expect(COMPLAINT_STATUS_LABEL[status]).toBeTruthy()
  })

  it('counts whole days waited, and never a negative one', () => {
    expect(waitingDays('2026-09-01T09:00:00.000Z', '2026-09-04T08:00:00.000Z')).toBe(2)
    expect(waitingDays('2026-09-01T09:00:00.000Z', '2026-09-01T23:00:00.000Z')).toBe(0)
    expect(waitingDays('2026-09-05T09:00:00.000Z', '2026-09-01T09:00:00.000Z')).toBe(0)
    expect(waitingDays('not a date', '2026-09-01T09:00:00.000Z')).toBe(0)
  })
})
