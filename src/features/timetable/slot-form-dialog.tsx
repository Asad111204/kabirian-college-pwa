'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import type { TimetableSubjectOption } from '@/server/services/timetable.service'
import { DAY_LABEL, type DayOfWeekValue } from '@/validation/timetable'

/** The cell being filled, and what is already in it. */
export interface SlotTarget {
  dayOfWeek: DayOfWeekValue
  period: number
  startTime: string
  endTime: string
  slotId?: string
  subjectId?: string
  staffId?: string
  room?: string
}

/**
 * Put one lesson in one cell of the week.
 *
 * The subject list is not every subject in the college — it is the section's
 * **curriculum**. The teacher list is not every teacher — it is the ones
 * holding an active assignment for that section *and* that subject, so it
 * changes as soon as the subject does. The server checks both again; these
 * dropdowns just stop the mistake being possible in the first place.
 */
export function SlotFormDialog({
  open,
  onOpenChange,
  sectionId,
  target,
  subjects,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sectionId: string
  target: SlotTarget | null
  subjects: TimetableSubjectOption[]
}) {
  const router = useRouter()
  const editing = Boolean(target?.slotId)

  const [subjectId, setSubjectId] = React.useState(target?.subjectId ?? '')
  const [staffId, setStaffId] = React.useState(target?.staffId ?? '')
  const [room, setRoom] = React.useState(target?.room ?? '')
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({})

  // Reset as the dialog opens, during render rather than in an effect, so the
  // form never flashes the previous cell's values.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setSubjectId(target?.subjectId ?? '')
      setStaffId(target?.staffId ?? '')
      setRoom(target?.room ?? '')
      setFormError(null)
      setFieldErrors({})
    }
  }

  const teachers = React.useMemo(
    () => subjects.find((s) => s.subjectId === subjectId)?.teachers ?? [],
    [subjects, subjectId],
  )

  // Changing the subject can leave a teacher selected who does not teach it.
  const effectiveStaffId = teachers.some((t) => t.staffId === staffId) ? staffId : ''

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!target) return

    setSubmitting(true)
    setFormError(null)
    setFieldErrors({})
    try {
      if (editing && target.slotId) {
        await api.patch(`/api/v1/timetable/${target.slotId}`, {
          subjectId,
          staffId: effectiveStaffId,
          room,
        })
      } else {
        await api.post('/api/v1/timetable', {
          sectionId,
          subjectId,
          staffId: effectiveStaffId,
          room,
          dayOfWeek: target.dayOfWeek,
          period: target.period,
        })
      }
      toast.success(editing ? 'Lesson updated.' : 'Lesson added.')
      onOpenChange(false)
      router.refresh()
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message)
        setFieldErrors(error.fields ?? {})
      } else {
        setFormError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (!target) return null

  const noTeachers = subjectId !== '' && teachers.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={editing ? 'Edit lesson' : 'Add lesson'}
        description={`${DAY_LABEL[target.dayOfWeek]} · Period ${target.period} · ${target.startTime}–${target.endTime}`}
      >
        <form onSubmit={submit} className="space-y-4">
          {formError ? <Alert variant="danger">{formError}</Alert> : null}

          <Field label="Subject" htmlFor="tt-subject" required error={fieldErrors.subjectId}>
            <Select
              id="tt-subject"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              required
            >
              <option value="">Choose a subject</option>
              {subjects.map((subject) => (
                <option key={subject.subjectId} value={subject.subjectId}>
                  {subject.subjectName}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Teacher"
            htmlFor="tt-teacher"
            required
            error={fieldErrors.staffId}
            hint={
              subjectId === ''
                ? 'Choose a subject first.'
                : 'Only teachers assigned to this subject in this section.'
            }
          >
            <Select
              id="tt-teacher"
              value={effectiveStaffId}
              onChange={(e) => setStaffId(e.target.value)}
              disabled={subjectId === '' || noTeachers}
              required
            >
              <option value="">Choose a teacher</option>
              {teachers.map((teacher) => (
                <option key={teacher.staffId} value={teacher.staffId}>
                  {teacher.fullName} ({teacher.staffCode})
                </option>
              ))}
            </Select>
          </Field>

          {noTeachers ? (
            <Alert variant="warning" title="Nobody is assigned to this subject here">
              Assign a teacher to this subject in this section first, on the staff member’s
              assignments page. The timetable will not schedule a teacher who is not assigned.
            </Alert>
          ) : null}

          <Field
            label="Room"
            htmlFor="tt-room"
            hint="Optional. Leave empty if the room is not decided."
            error={fieldErrors.room}
          >
            <Input
              id="tt-room"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              maxLength={50}
              placeholder="Lab 1"
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || subjectId === '' || !effectiveStaffId}>
              {submitting ? 'Saving…' : editing ? 'Save lesson' : 'Add lesson'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
