'use client'

import * as React from 'react'
import { CalendarDays, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, Select } from '@/components/ui/field'
import { Alert, EmptyState, TableSkeleton } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import type {
  SectionTimetable,
  TimetableOptions,
  TimetableSlotRow,
} from '@/server/services/timetable.service'
import { DAY_LABEL, TIMETABLE_DAYS, type DayOfWeekValue } from '@/validation/timetable'
import { DeactivateSlotDialog } from './deactivate-slot-dialog'
import { SlotFormDialog, type SlotTarget } from './slot-form-dialog'

/**
 * The master timetable, one section at a time.
 *
 * Rows are the college's fixed periods and columns are the days, so the grid on
 * screen is the grid on the wall. The break is a row of its own — the college
 * stops between 11:10 and 11:40, and the timetable says so rather than leaving a
 * mysterious empty line or, worse, a made-up lesson holding the space.
 *
 * The clock times are never typed here and never sent: they come from
 * `periods.ts` through the service, and the form has no time fields at all.
 *
 * The server is the authority on every rule. This screen narrows what can be
 * chosen — a section's own curriculum, and under each subject only the teachers
 * actually assigned to it — so mistakes are hard to make, but it never decides
 * anything: a clash is whatever the API says it is.
 */
export function TimetableBuilder({ initialOptions }: { initialOptions: TimetableOptions }) {
  const [options, setOptions] = React.useState(initialOptions)
  const [sessionId, setSessionId] = React.useState(initialOptions.selectedSessionId ?? '')
  const [sectionId, setSectionId] = React.useState('')
  const [timetable, setTimetable] = React.useState<SectionTimetable | null>(null)

  const [loadingSections, setLoadingSections] = React.useState(false)
  const [loadingTimetable, setLoadingTimetable] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  const [formTarget, setFormTarget] = React.useState<SlotTarget | null>(null)
  const [toDeactivate, setToDeactivate] = React.useState<{
    slot: TimetableSlotRow
    day: DayOfWeekValue
  } | null>(null)

  const message = (error: unknown, fallback: string) =>
    error instanceof ApiError ? error.message : fallback

  /** Switching year throws away the section: it belongs to the other one. */
  async function changeSession(nextSessionId: string) {
    setSessionId(nextSessionId)
    setSectionId('')
    setTimetable(null)
    setLoadError(null)
    if (!nextSessionId) return

    setLoadingSections(true)
    try {
      setOptions(
        await api.get<TimetableOptions>(
          `/api/v1/timetable/options?sessionId=${encodeURIComponent(nextSessionId)}`,
        ),
      )
    } catch (error) {
      setLoadError(message(error, 'Could not load the sections for that session.'))
    } finally {
      setLoadingSections(false)
    }
  }

  const loadTimetable = React.useCallback(async (id: string) => {
    setLoadingTimetable(true)
    setLoadError(null)
    try {
      setTimetable(
        await api.get<SectionTimetable>(
          `/api/v1/timetable/section?sectionId=${encodeURIComponent(id)}`,
        ),
      )
    } catch (error) {
      setTimetable(null)
      setLoadError(message(error, 'Could not load that section’s timetable.'))
    } finally {
      setLoadingTimetable(false)
    }
  }, [])

  async function changeSection(nextSectionId: string) {
    setSectionId(nextSectionId)
    setTimetable(null)
    setLoadError(null)
    if (nextSectionId) await loadTimetable(nextSectionId)
  }

  /** Re-read the week after a save, so the grid shows what was actually stored. */
  const refresh = React.useCallback(async () => {
    if (sectionId) await loadTimetable(sectionId)
  }, [sectionId, loadTimetable])

  const slotAt = (day: DayOfWeekValue, period: number) =>
    timetable?.slots.find((s) => s.dayOfWeek === day && s.period === period) ?? null

  /* ---------------------------------------------------------------------- */

  if (options.sessions.length === 0) {
    return (
      <Alert variant="warning" title="No academic session yet">
        Create an academic session before building a timetable.
      </Alert>
    )
  }

  const noSections = !loadingSections && options.sections.length === 0

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field label="Academic session" htmlFor="tt-session">
            <Select
              id="tt-session"
              value={sessionId}
              onChange={(e) => void changeSession(e.target.value)}
              disabled={loadingSections}
            >
              {options.sessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name}
                  {session.isCurrent ? ' (current)' : ''}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Section"
            htmlFor="tt-section"
            hint={loadingSections ? 'Loading sections…' : undefined}
          >
            <Select
              id="tt-section"
              value={sectionId}
              onChange={(e) => void changeSection(e.target.value)}
              disabled={loadingSections || options.sections.length === 0}
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
        </CardContent>
      </Card>

      {loadError ? (
        <Alert variant="danger" title="Could not load the timetable">
          {loadError}
        </Alert>
      ) : null}

      {noSections ? (
        <EmptyState
          title="No sections in this session"
          description="Build the session structure first — a timetable belongs to a section."
        />
      ) : null}

      {loadingTimetable ? (
        <Card>
          <CardContent className="p-0">
            <TableSkeleton rows={8} columns={7} />
          </CardContent>
        </Card>
      ) : null}

      {!loadingTimetable && !timetable && !noSections && !loadError ? (
        <EmptyState
          icon={CalendarDays}
          title="Choose a section"
          description="Pick a section above to see and build its weekly timetable."
        />
      ) : null}

      {!loadingTimetable && timetable ? (
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
                Weekly timetable for {timetable.section.className}{' '}
                {timetable.section.divisionName} {timetable.section.programName} section{' '}
                {timetable.section.sectionName}
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="w-28 border border-border bg-surface-muted px-2 py-2 text-left text-xs font-semibold text-foreground-muted"
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
                  const heading = (
                    <th
                      scope="row"
                      className="border border-border bg-surface-muted px-2 py-2 text-left align-top"
                    >
                      <span className="block text-xs font-semibold text-foreground">
                        Period {period.period}
                      </span>
                      <span className="block text-[11px] tabular-nums text-foreground-muted">
                        {period.start}–{period.end}
                      </span>
                    </th>
                  )

                  // The break is the college's own, and nothing may be put in
                  // it. It is spelled out in words, not signalled by shading.
                  if (period.isBreak) {
                    return (
                      <tr key={period.period}>
                        {heading}
                        <td
                          colSpan={TIMETABLE_DAYS.length}
                          aria-disabled="true"
                          className="border border-border bg-surface-muted px-2 py-3 text-center text-xs font-semibold uppercase tracking-wide text-foreground-muted"
                        >
                          Break — no classes are scheduled
                        </td>
                      </tr>
                    )
                  }

                  return (
                    <tr key={period.period}>
                      {heading}
                      {TIMETABLE_DAYS.map((day) => {
                        const slot = slotAt(day, period.period)
                        const where = `${DAY_LABEL[day]}, period ${period.period}`
                        return (
                          <td key={day} className="border border-border px-2 py-1.5 align-top">
                            {slot ? (
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground">
                                  {slot.subjectName}
                                </p>
                                <p className="text-xs text-foreground-muted">{slot.staffName}</p>
                                {slot.room ? (
                                  <p className="text-xs text-foreground-muted">Room {slot.room}</p>
                                ) : null}
                                <div className="mt-1 flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      setFormTarget({
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
                                    aria-label={`Edit ${slot.subjectName} on ${where}`}
                                  >
                                    <Pencil className="h-3.5 w-3.5" aria-hidden />
                                    Edit
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setToDeactivate({ slot, day })}
                                    aria-label={`Deactivate ${slot.subjectName} on ${where}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                                    Deactivate
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={timetable.subjects.length === 0}
                                onClick={() =>
                                  setFormTarget({
                                    dayOfWeek: day,
                                    period: period.period,
                                    startTime: period.start,
                                    endTime: period.end,
                                  })
                                }
                                aria-label={`Add a class on ${where}`}
                              >
                                <Plus className="h-3.5 w-3.5" aria-hidden />
                                Add Class
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
            open={formTarget !== null}
            onOpenChange={(open) => {
              if (!open) setFormTarget(null)
            }}
            sectionId={timetable.section.sectionId}
            target={formTarget}
            subjects={timetable.subjects}
            onSaved={async () => {
              setFormTarget(null)
              await refresh()
            }}
          />

          <DeactivateSlotDialog
            open={toDeactivate !== null}
            onOpenChange={(open) => {
              if (!open) setToDeactivate(null)
            }}
            slot={toDeactivate?.slot ?? null}
            dayLabel={toDeactivate ? DAY_LABEL[toDeactivate.day] : ''}
            onDone={async () => {
              setToDeactivate(null)
              toast.success('Timetable entry deactivated.')
              await refresh()
            }}
          />
        </>
      ) : null}
    </div>
  )
}
