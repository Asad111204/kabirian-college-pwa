'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Field, Input, Select } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import type { PaperOptionClass } from '@/server/services/exams.service'

export interface PaperFormValues {
  id?: string
  classId: string
  programId: string
  subjectId: string
  examDate: string
  startTime: string
  endTime: string
  room: string
  maxMarks: string
  passingPercentage: string
}

const BLANK: PaperFormValues = {
  classId: '',
  programId: '',
  subjectId: '',
  examDate: '',
  startTime: '',
  endTime: '',
  room: '',
  maxMarks: '100',
  passingPercentage: '50',
}

/**
 * Add or edit one paper.
 *
 * The subject list is not a list of every subject in the college — it is the
 * curriculum for the class and programme chosen above it. Picking "All
 * programmes" narrows it further, to the subjects *every* programme in that
 * class studies, because a paper for the whole class has to be one every one of
 * its students actually takes. The server checks the same thing again; this
 * dropdown just stops the mistake being possible in the first place.
 */
export function PaperFormDialog({
  open,
  onOpenChange,
  examId,
  options,
  initial,
  examStart,
  examEnd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  examId: string
  options: PaperOptionClass[]
  initial?: PaperFormValues
  examStart: string | null
  examEnd: string | null
}) {
  const router = useRouter()
  const editing = Boolean(initial?.id)

  const [values, setValues] = React.useState<PaperFormValues>(initial ?? BLANK)
  const [submitting, setSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({})

  // Reset when the dialog opens, adjusted during render rather than in an
  // effect: React supports this for exactly this case, and it avoids the extra
  // pass where the form would briefly show the previous paper's values.
  const [wasOpen, setWasOpen] = React.useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setValues(initial ?? { ...BLANK, classId: options[0]?.id ?? '' })
      setFormError(null)
      setFieldErrors({})
    }
  }

  const selectedClass = React.useMemo(
    () => options.find((c) => c.id === values.classId) ?? null,
    [options, values.classId],
  )

  const subjects = React.useMemo(() => {
    if (!selectedClass) return []
    if (!values.programId) return selectedClass.sharedSubjects
    return selectedClass.programs.find((p) => p.id === values.programId)?.subjects ?? []
  }, [selectedClass, values.programId])

  /** Changing the class or programme can strand the chosen subject. */
  function chooseClass(classId: string) {
    setValues((v) => ({ ...v, classId, programId: '', subjectId: '' }))
  }

  function chooseProgram(programId: string) {
    setValues((v) => {
      const next = selectedClass
        ? programId
          ? (selectedClass.programs.find((p) => p.id === programId)?.subjects ?? [])
          : selectedClass.sharedSubjects
        : []
      const keep = next.some((s) => s.id === v.subjectId)
      return { ...v, programId, subjectId: keep ? v.subjectId : '' }
    })
  }

  const set = (patch: Partial<PaperFormValues>) => setValues((v) => ({ ...v, ...patch }))

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setFormError(null)
    setFieldErrors({})

    const payload = {
      classId: values.classId,
      subjectId: values.subjectId,
      programId: values.programId || '',
      examDate: values.examDate || '',
      startTime: values.startTime || '',
      endTime: values.endTime || '',
      room: values.room.trim() || undefined,
      maxMarks: values.maxMarks.trim(),
      passingPercentage: values.passingPercentage.trim() || '50',
    }

    try {
      if (editing) {
        await api.put(`/api/v1/exams/${examId}/papers/${initial!.id}`, payload)
        toast.success('Paper updated.')
      } else {
        await api.post(`/api/v1/exams/${examId}/papers`, payload)
        toast.success('Paper added.')
      }
      onOpenChange(false)
      router.refresh()
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message)
        if (error.fields) setFieldErrors(error.fields)
      } else {
        setFormError('Something went wrong. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const errorOf = (field: string) => fieldErrors[field]?.[0]
  const noSharedSubjects = Boolean(selectedClass && selectedClass.sharedSubjects.length === 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={editing ? 'Edit paper' : 'Add a paper'}
        description="Subjects come from this class and programme’s curriculum."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError ? <Alert variant="danger">{formError}</Alert> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Class" htmlFor="paper-class" required error={errorOf('classId')}>
              <Select
                id="paper-class"
                value={values.classId}
                onChange={(e) => chooseClass(e.target.value)}
                required
              >
                <option value="">Choose a class…</option>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Programme"
              htmlFor="paper-program"
              hint="Leave as “All programmes” for a subject every programme sits."
              error={errorOf('programId')}
            >
              <Select
                id="paper-program"
                value={values.programId}
                onChange={(e) => chooseProgram(e.target.value)}
                disabled={!selectedClass}
              >
                <option value="">All programmes</option>
                {(selectedClass?.programs ?? []).map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Subject" htmlFor="paper-subject" required error={errorOf('subjectId')}>
            <Select
              id="paper-subject"
              value={values.subjectId}
              onChange={(e) => set({ subjectId: e.target.value })}
              disabled={!selectedClass || subjects.length === 0}
              required
            >
              <option value="">Choose a subject…</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                  {subject.code ? ` (${subject.code})` : ''}
                </option>
              ))}
            </Select>
          </Field>

          {selectedClass && subjects.length === 0 ? (
            <Alert variant="warning">
              {values.programId
                ? 'This class and programme has no curriculum subjects yet. Set the curriculum first.'
                : noSharedSubjects
                  ? 'No subject is studied by every programme in this class, so there is no paper the whole class can sit. Choose a programme instead.'
                  : 'No subjects are available for this choice.'}
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Date"
              htmlFor="paper-date"
              error={errorOf('examDate')}
              hint={examStart || examEnd ? `Between ${examStart ?? '—'} and ${examEnd ?? '—'}` : undefined}
            >
              <Input
                id="paper-date"
                type="date"
                value={values.examDate}
                min={examStart ?? undefined}
                max={examEnd ?? undefined}
                onChange={(e) => set({ examDate: e.target.value })}
              />
            </Field>

            <Field label="Starts" htmlFor="paper-start" error={errorOf('startTime')}>
              <Input
                id="paper-start"
                type="time"
                value={values.startTime}
                onChange={(e) => set({ startTime: e.target.value })}
              />
            </Field>

            <Field label="Ends" htmlFor="paper-end" error={errorOf('endTime')}>
              <Input
                id="paper-end"
                type="time"
                value={values.endTime}
                onChange={(e) => set({ endTime: e.target.value })}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Maximum marks"
              htmlFor="paper-max"
              required
              error={errorOf('maxMarks')}
            >
              <Input
                id="paper-max"
                inputMode="decimal"
                value={values.maxMarks}
                onChange={(e) => set({ maxMarks: e.target.value })}
                placeholder="100"
                required
              />
            </Field>

            <Field
              label="Passing %"
              htmlFor="paper-pass"
              required
              hint="Stored with the paper, so a later policy change never rewrites this exam."
              error={errorOf('passingPercentage')}
            >
              <Input
                id="paper-pass"
                inputMode="decimal"
                value={values.passingPercentage}
                onChange={(e) => set({ passingPercentage: e.target.value })}
                placeholder="50"
                required
              />
            </Field>

            <Field label="Room" htmlFor="paper-room" error={errorOf('room')}>
              <Input
                id="paper-room"
                value={values.room}
                onChange={(e) => set({ room: e.target.value })}
                placeholder="Optional"
              />
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting} disabled={subjects.length === 0}>
              {editing ? 'Save paper' : 'Add paper'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
