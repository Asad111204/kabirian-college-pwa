/**
 * Marks validation, shared by the browser and the server.
 *
 * The browser copy gives instant feedback; this copy is the security boundary.
 * It settles the shape of a mark — that a status and a value agree — but not
 * whether the value fits the paper, which needs the paper's maximum and so is
 * checked in the service, nor who may send it, which is settled in
 * `exams/marks-access.ts`.
 *
 * Marks travel as **strings**, not numbers. They end up in a DECIMAL(6,2)
 * column and are compared exactly (ADR-105); parsing them into JavaScript
 * floats on the way in would undo that before the value ever reached the
 * database.
 */
import { z } from 'zod'
import { optionalText, uuid } from './common'
import { marksValue } from './exams'
import { tryHundredths } from '@/server/exams/exact'

/* -------------------------------------------------------------------------- */
/* Statuses                                                                   */
/* -------------------------------------------------------------------------- */

/** Mirrors the `MarkStatus` enum. */
export const MARK_STATUSES = ['PENDING', 'ENTERED', 'ABSENT'] as const
export type MarkStatusValue = (typeof MARK_STATUSES)[number]

export const MARK_STATUS_LABEL: Record<MarkStatusValue, string> = {
  PENDING: 'Not entered',
  ENTERED: 'Entered',
  ABSENT: 'Absent',
}

/** Mirrors the `MarkSheetStatus` enum. */
export const MARK_SHEET_STATUSES = ['DRAFT', 'SUBMITTED', 'PUBLISHED'] as const
export type MarkSheetStatusValue = (typeof MARK_SHEET_STATUSES)[number]

export const MARK_SHEET_STATUS_LABEL: Record<MarkSheetStatusValue, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  PUBLISHED: 'Published',
}

/* -------------------------------------------------------------------------- */
/* One student's mark                                                         */
/* -------------------------------------------------------------------------- */

/**
 * A mark for one student.
 *
 * The three states are kept apart deliberately, and the database enforces the
 * same rule with a CHECK constraint (ADR-102):
 *
 *   - `PENDING` — nobody has entered a mark, and the value must be absent. A
 *     missing mark is never a zero.
 *   - `ENTERED` — a value is required, and may be a decimal.
 *   - `ABSENT`  — the student did not sit the paper. It scores zero, but the
 *     absence stays recorded as its own fact rather than as a mark of 0.
 */
export const markRowSchema = z
  .object({
    studentId: uuid,
    status: z.enum(MARK_STATUSES, { error: 'Choose Entered, Absent, or leave it unentered.' }),
    /** Sent as `''` or omitted when there is no mark. */
    obtainedMarks: z
      .union([z.literal(''), z.null(), marksValue, z.literal('0'), z.literal('0.00')])
      .transform((value) => (value === '' || value === null ? undefined : value))
      .optional(),
    remarks: optionalText(255),
  })
  .superRefine((row, ctx) => {
    const hasValue = row.obtainedMarks !== undefined

    if (row.status === 'PENDING' && hasValue) {
      ctx.addIssue({
        code: 'custom',
        path: ['obtainedMarks'],
        message: 'An unentered mark cannot carry a value.',
      })
    }

    if (row.status === 'ENTERED' && !hasValue) {
      ctx.addIssue({
        code: 'custom',
        path: ['obtainedMarks'],
        message: 'Enter a mark, or mark the student absent.',
      })
    }

    if (row.status === 'ABSENT' && hasValue && tryHundredths(row.obtainedMarks!) !== 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['obtainedMarks'],
        message: 'An absent student scores zero.',
      })
    }
  })

export type MarkRowInput = z.infer<typeof markRowSchema>

/**
 * A whole sheet, saved in one request.
 *
 * `expectedUpdatedAt` is the sheet's timestamp as the browser last saw it. If
 * the stored sheet has moved on — someone else saved or submitted it — the save
 * is refused rather than silently overwriting their work.
 */
export const saveMarksSchema = z.object({
  expectedUpdatedAt: z.iso.datetime().optional(),
  rows: z
    .array(markRowSchema)
    .min(1, 'There are no marks to save.')
    .max(500, 'That is more students than any one section holds.'),
})

export type SaveMarksInput = z.infer<typeof saveMarksSchema>

/** Opening a mark sheet: one paper, one section. Nothing else is trusted. */
export const openMarkSheetSchema = z.object({
  examPaperId: uuid,
  sectionId: uuid,
})

export type OpenMarkSheetInput = z.infer<typeof openMarkSheetSchema>
