'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, Select } from '@/components/ui/field'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import type { SectionTimetable, TimetableOptions } from '@/server/services/timetable.service'
import { DAY_LABEL, TIMETABLE_DAYS, type DayOfWeekValue } from '@/validation/timetable'
import { SlotFormDialog, type SlotTarget } from './slot-form-dialog'

/**
 * The master timetable, one section at a time.
 *
 * Rows are the college's fixed periods and columns are the days, so the grid on
 * screen is the grid on the wall. The break is a row of its own — the college
 * stops between 11:10 and 11:40, and the timetable says so rather than leaving
 * a mysterious empty line or, worse, a made-up lesson holding the space.
 */
export function TimetableBuilder({
  options,
  timetable,
}: {
  options: TimetableOptions
  timetable: SectionTimetable | null
}) {
  const router = useRouter()
  const [dialogTarget, setDialogTarget] = React.useState<SlotTarget | null>(null)
  const [clearing, setClearing] = React.useState<string | null>(null)

  const slotAt = React.useCallback(
    (day: DayOfWeekValue, period: number) =>
      timetable?.slots.find((s) => s.dayOfWeek === day && s.period === period) ?? null,
    [timetable],
  )

  async function clearSlot(slotId: string) {
    setClearing(slotId)
    try {
      await api.delete(`/api/v1/timetable/${slotId}`)
      toast.success('Lesson removed.')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not remove that lesson.')
    } finally {
      setClearing(null)
    }
  }

  if (!options.currentSession) {
    return (
      <Alert variant="warning" title="No current academic session">
        Set a current session before building a timetable.
      </Alert>
    )
  }

  if (options.sections.length === 0) {
    return (
      <EmptyState
        title="No sections yet"
        description="Build the session structure first — a timetable belongs to a section."
      />
    )
  }

  return (
    <div className="space-y-4">
      <Field label="Section" htmlFor="tt-section" className="max-w-md">
        <Select
          id="tt-section"
          value={timetable?.section.sectionId ?? ''}
          onChange={(e) => {
            const value = e.target.value
            router.push(value ? `/admin/timetable?sectionId=${value}` : '/admin/timetable')
          }}
        >
          <option value="">Choose a section</option>
          {options.sections.map((section) => (
            <option key={section.sectionId} value={section.sectionId}>
              {section.className} · {section.divisionName} · {section.programName} · Section{' '}
              {section.sectionName}
            </option>
          ))}
        </Select>
      </Field>

      {!timetable ? (
        <EmptyState
          title="Choose a section"
          description="Pick a section above to see and build its weekly timetable."
        />
      ) : (
        <>
          {timetable.subjects.length === 0 ? (
            <Alert variant="warning" title="This section has no curriculum yet">
              Add subjects to this class and programme on the Curriculum screen before timetabling
              them.
            </Alert>
          ) : null}

          <div className="scroll-x overflow-x-auto">
            <table className="w-full min-w-[56rem] border-collapse text-sm">
              <caption className="sr-only">
                Weekly timetable for {timetable.section.className} section{' '}
                {timetable.section.sectionName}
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="w-32 border border-border bg-surface-muted px-2 py-2 text-left text-xs font-semibold text-foreground-muted"
                  >
                    Period
                  </th>
                  {TIMETABLE_DAYS.map((day) => (
                    <th
                      key={day}
                      scope="col"
                      className="border border-border bg-surface-muted px-2 py-2 text-left text-xs font-semibold text-foreground-muted"
                    >
                      {DAY_LABEL[day]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timetable.periods.map((period) => {
                  if (period.isBreak) {
                    return (
                      <tr key={period.period}>
                        <th
                          scope="row"
                          className="border border-border bg-surface-muted px-2 py-2 text-left align-top"
                        >
                          <span className="block text-xs font-semibold text-foreground">
                            {period.period}
                          </span>
                          <span className="block text-[11px] text-foreground-muted tabular-nums">
                            {period.start}–{period.end}
                          </span>
                        </th>
                        <td
                          colSpan={TIMETABLE_DAYS.length}
                          className="border border-border bg-surface-muted px-2 py-2 text-center text-xs font-medium tracking-wide text-foreground-muted uppercase"
                        >
                          Break
                        </td>
                      </tr>
                    )
                  }

                  return (
                    <tr key={period.period}>
                      <th
                        scope="row"
                        className="border border-border bg-surface-muted px-2 py-2 text-left align-top"
                      >
                        <span className="block text-xs font-semibold text-foreground">
                          {period.period}
                        </span>
                        <span className="block text-[11px] text-foreground-muted tabular-nums">
                          {period.start}–{period.end}
                        </span>
                      </th>

                      {TIMETABLE_DAYS.map((day) => {
                        const slot = slotAt(day, period.period)
                        return (
                          <td
                            key={day}
                            className="border border-border px-2 py-1.5 align-top"
                            style={{ width: `${100 / TIMETABLE_DAYS.length}%` }}
                          >
                            {slot ? (
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-foreground">
                                  {slot.subjectName}
                                </p>
                                <p className="truncate text-xs text-foreground-muted">
                                  {slot.staffName}
                                  {slot.room ? ` · ${slot.room}` : ''}
                                </p>
                                <div className="mt-1 flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      setDialogTarget({
                                        dayOfWeek: day,
                                        period: period.period,
                                        startTime: period.start,
                                        endTime: period.end,
                                        slotId: slot.id,
                                        subjectId: slot.subjectId,
                                        staffId: slot.staffId,
                                        room: slot.room ?? '',
                                      })
                                    }
                                    aria-label={`Edit ${slot.subjectName} on ${DAY_LABEL[day]} period ${period.period}`}
                                  >
                                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={clearing === slot.id}
                                    onClick={() => clearSlot(slot.id)}
                                    aria-label={`Remove ${slot.subjectName} from ${DAY_LABEL[day]} period ${period.period}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={timetable.subjects.length === 0}
                                onClick={() =>
                                  setDialogTarget({
                                    dayOfWeek: day,
                                    period: period.period,
                                    startTime: period.start,
                                    endTime: period.end,
                                  })
                                }
                                aria-label={`Add a lesson on ${DAY_LABEL[day]} period ${period.period}`}
                              >
                                <Plus className="h-3.5 w-3.5" aria-hidden />
                                Add
                              </Button>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <SlotFormDialog
            open={dialogTarget !== null}
            onOpenChange={(open) => {
              if (!open) setDialogTarget(null)
            }}
            sectionId={timetable.section.sectionId}
            target={dialogTarget}
            subjects={timetable.subjects}
          />
        </>
      )}
    </div>
  )
}
