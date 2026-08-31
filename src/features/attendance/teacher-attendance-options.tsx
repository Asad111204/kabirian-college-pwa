'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { BookOpen, ClipboardCheck, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/field'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import { PERIOD_MAX, PERIOD_MIN } from '@/server/attendance/attendance-policy'
import { SheetStatusBadge } from './shared'
import type { SheetStatusValue } from './shared'

export interface TeacherMarkingOption {
  kind: 'subject' | 'daily'
  sectionId: string
  subjectId: string | null
  subjectName: string | null
  sessionName: string
  className: string
  divisionName: string
  programName: string
  sectionName: string
  studentCount: number
  todaySheets: Array<{ id: string; period: number; status: SheetStatusValue }>
}

/**
 * The teacher's attendance home.
 *
 * Only what this teacher may actually mark: subjects they hold an active
 * assignment for, and the sections they are in charge of. The list comes from
 * the server, built from their own records — there is no section picker, no
 * subject picker and nothing to type, so there is nothing to tamper with either.
 */
export function TeacherAttendanceOptions({
  options,
  today,
  todayLabel,
  canCreate,
}: {
  options: TeacherMarkingOption[]
  today: string
  todayLabel: string
  canCreate: boolean
}) {
  const subjects = options.filter((o) => o.kind === 'subject')
  const daily = options.filter((o) => o.kind === 'daily')

  if (options.length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="No attendance assignments yet"
        description="Ask the administrator to assign your subjects, or to make you the in-charge of a section."
        action={
          <Button variant="secondary" asChild>
            <Link href="/staff/assignments">View my assignments</Link>
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-6">
      {daily.length > 0 ? (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground-muted">
            <Users className="h-4 w-4" aria-hidden />
            Daily roll call
          </h2>
          <div className="space-y-2">
            {daily.map((option) => (
              <OptionCard
                key={`daily-${option.sectionId}`}
                option={option}
                today={today}
                todayLabel={todayLabel}
                canCreate={canCreate}
              />
            ))}
          </div>
        </section>
      ) : null}

      {subjects.length > 0 ? (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-foreground-muted">
            <BookOpen className="h-4 w-4" aria-hidden />
            Subjects
          </h2>
          <div className="space-y-2">
            {subjects.map((option) => (
              <OptionCard
                key={`subject-${option.sectionId}-${option.subjectId}`}
                option={option}
                today={today}
                todayLabel={todayLabel}
                canCreate={canCreate}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function OptionCard({
  option,
  today,
  todayLabel,
  canCreate,
}: {
  option: TeacherMarkingOption
  today: string
  todayLabel: string
  canCreate: boolean
}) {
  const router = useRouter()
  const [period, setPeriod] = React.useState('1')
  const [starting, setStarting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const usedPeriods = new Set(option.todaySheets.map((s) => s.period))
  const title = option.kind === 'daily' ? 'Daily roll call' : (option.subjectName ?? 'Subject')
  const noStudents = option.studentCount === 0

  async function start() {
    setStarting(true)
    setError(null)
    try {
      const sheet = await api.post<{ id: string }>('/api/v1/attendance/sheets', {
        sectionId: option.sectionId,
        subjectId: option.subjectId,
        date: today,
        period: Number(period),
      })
      router.push(`/staff/attendance/${sheet.id}`)
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.status === 409
            ? 'Attendance for this period has already been opened.'
            : err.message
          : 'Unable to start attendance. Please check your connection.'
      setError(message)
      toast.error(message)
      setStarting(false)
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium">{title}</p>
          <p className="mt-0.5 text-sm text-foreground-muted">
            {option.className} · {option.divisionName} · {option.programName} · Section{' '}
            {option.sectionName}
          </p>
          <p className="mt-0.5 text-xs text-foreground-subtle">
            {option.studentCount} student{option.studentCount === 1 ? '' : 's'} · {todayLabel}
          </p>
        </div>

        {option.todaySheets.length === 0 && canCreate && !noStudents ? (
          <div className="flex items-center gap-2">
            <label htmlFor={`period-${option.sectionId}-${option.subjectId ?? 'daily'}`} className="text-xs text-foreground-muted">
              Period
            </label>
            <Select
              id={`period-${option.sectionId}-${option.subjectId ?? 'daily'}`}
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="h-10 w-20"
            >
              {Array.from({ length: PERIOD_MAX - PERIOD_MIN + 1 }, (_, i) => i + PERIOD_MIN).map(
                (n) => (
                  <option key={n} value={n} disabled={usedPeriods.has(n)}>
                    {n}
                    {usedPeriods.has(n) ? ' · done' : ''}
                  </option>
                ),
              )}
            </Select>
            <Button onClick={start} loading={starting}>
              Start attendance
            </Button>
          </div>
        ) : null}
      </div>

      {noStudents ? (
        <Alert variant="warning" className="mt-3">
          No active students are enrolled in this section.
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="danger" className="mt-3">
          {error}
        </Alert>
      ) : null}

      {option.todaySheets.length > 0 ? (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <p className="text-xs font-medium text-foreground-muted">Attendance already recorded</p>
          {option.todaySheets.map((sheet) => (
            <div key={sheet.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm">
                Period {sheet.period}
                <SheetStatusBadge status={sheet.status} />
              </span>
              <Button variant="secondary" size="sm" asChild>
                <Link href={`/staff/attendance/${sheet.id}`}>
                  {sheet.status === 'DRAFT'
                    ? 'Continue draft'
                    : sheet.status === 'SUBMITTED'
                      ? 'View register'
                      : 'View'}
                </Link>
              </Button>
            </div>
          ))}

          {canCreate && !noStudents ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs text-foreground-muted">Another period?</span>
              <Select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="h-9 w-20"
                aria-label="Period for a new register"
              >
                {Array.from({ length: PERIOD_MAX - PERIOD_MIN + 1 }, (_, i) => i + PERIOD_MIN).map(
                  (n) => (
                    <option key={n} value={n} disabled={usedPeriods.has(n)}>
                      {n}
                      {usedPeriods.has(n) ? ' · done' : ''}
                    </option>
                  ),
                )}
              </Select>
              <Button
                variant="secondary"
                size="sm"
                onClick={start}
                loading={starting}
                disabled={usedPeriods.has(Number(period))}
              >
                Start
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Card>
  )
}
