import * as React from 'react'
import { EmptyState } from '@/components/ui/feedback'
import type { TeacherTimetable } from '@/server/services/timetable.service'
import { DAY_LABEL, TIMETABLE_DAYS, type DayOfWeekValue } from '@/validation/timetable'

/**
 * A teacher's own week.
 *
 * Read-only, and presentational only: the service has already limited this to
 * the lessons where the signed-in teacher is the one taking the class. There is
 * no control here that changes anything, because a teacher does not edit the
 * master timetable.
 *
 * Each lesson says the three things a teacher needs to walk into the right
 * room: which class and section, which subject, and when.
 */
export function TeacherTimetableGrid({ timetable }: { timetable: TeacherTimetable }) {
  if (timetable.lessons.length === 0) {
    return (
      <EmptyState
        title="No lessons timetabled yet"
        description="Once the college office puts your classes on the timetable, your week appears here."
      />
    )
  }

  const lessonAt = (day: DayOfWeekValue, period: number) =>
    timetable.lessons.find((l) => l.dayOfWeek === day && l.period === period) ?? null

  const byDay = TIMETABLE_DAYS.map((day) => ({
    day,
    lessons: timetable.lessons
      .filter((l) => l.dayOfWeek === day)
      .sort((a, b) => a.period - b.period),
  })).filter((d) => d.lessons.length > 0)

  return (
    <>
      {/* Phones read a day at a time; a six-by-nine grid is unusable there. */}
      <div className="space-y-4 md:hidden">
        {byDay.map(({ day, lessons }) => (
          <div key={day}>
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-foreground-muted uppercase">
              {DAY_LABEL[day]}
            </h3>
            <ul className="divide-y divide-border rounded-[var(--radius-control)] border border-border">
              {lessons.map((lesson) => (
                <li key={lesson.id} className="p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-medium text-foreground">
                      {lesson.subjectName}
                    </p>
                    <p className="shrink-0 text-xs text-foreground-muted tabular-nums">
                      {lesson.startTime}–{lesson.endTime}
                    </p>
                  </div>
                  <p className="mt-0.5 text-xs text-foreground-muted">
                    {lesson.className} · {lesson.divisionName} · {lesson.programName} · Section{' '}
                    {lesson.sectionName}
                    {lesson.room ? ` · ${lesson.room}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="scroll-x hidden overflow-x-auto md:block">
        <table className="w-full min-w-[52rem] border-collapse text-sm">
          <caption className="sr-only">
            My weekly timetable{timetable.sessionName ? ` for ${timetable.sessionName}` : ''}
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
            {timetable.periods.map((period) =>
              period.isBreak ? (
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
              ) : (
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
                    const lesson = lessonAt(day, period.period)
                    return (
                      <td key={day} className="border border-border px-2 py-1.5 align-top">
                        {lesson ? (
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {lesson.subjectName}
                            </p>
                            <p className="truncate text-xs text-foreground-muted">
                              {lesson.className} · Section {lesson.sectionName}
                              {lesson.room ? ` · ${lesson.room}` : ''}
                            </p>
                          </div>
                        ) : (
                          <span className="sr-only">Free</span>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
