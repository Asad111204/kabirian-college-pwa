'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import { SheetStatusBadge } from './shared'
import type { SheetStatusValue } from './shared'

export interface TeacherMarkingOption {
  sectionId: string
  sessionName: string
  className: string
  divisionName: string
  programName: string
  sectionName: string
  studentCount: number
  /** Why this register is theirs today. */
  reason: 'FIRST_PERIOD' | 'NO_LESSONS'
  /** The period their claim rests on, or null when the day is empty. */
  firstPeriod: number | null
  /** The register for this section today, if one has been opened. */
  todaySheet: { id: string; status: SheetStatusValue } | null
}

/**
 * The teacher's attendance home.
 *
 * One card per section, because there is one register per section per day. A
 * section is here because this teacher has its first period today — or, when
 * the section has no lessons at all today, because they are its in-charge.
 *
 * The list is built on the server from the timetable and this teacher's own
 * records. There is no section picker, no subject picker, no period box and
 * nothing to type, so there is nothing to tamper with either.
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
  if (options.length === 0) {
    return (
      <EmptyState
        icon={ClipboardCheck}
        title="No register is yours today"
        description="The register belongs to the teacher who has the section's first period that day. Nothing on today's timetable starts with you."
        action={
          <Button variant="secondary" asChild>
            <Link href="/staff/timetable">View my timetable</Link>
          </Button>
        }
      />
    )
  }

  return (
    <div className="space-y-2">
      {options.map((option) => (
        <OptionCard
          key={option.sectionId}
          option={option}
          today={today}
          todayLabel={todayLabel}
          canCreate={canCreate}
        />
      ))}
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
  const [starting, setStarting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const noStudents = option.studentCount === 0

  async function start() {
    setStarting(true)
    setError(null)
    try {
      const sheet = await api.post<{ id: string }>('/api/v1/attendance/sheets', {
        sectionId: option.sectionId,
        date: today,
      })
      router.push(`/staff/attendance/${sheet.id}`)
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.status === 409
            ? 'This section’s register for today has already been started.'
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
          <p className="font-medium">
            {option.className} · {option.divisionName} · {option.programName} · Section{' '}
            {option.sectionName}
          </p>
          <p className="mt-0.5 text-sm text-foreground-muted">
            {option.reason === 'FIRST_PERIOD'
              ? `Your period ${option.firstPeriod} — the first lesson of their day`
              : 'Nothing timetabled today, so it falls to you as in-charge'}
          </p>
          <p className="mt-0.5 text-xs text-foreground-subtle">
            {option.studentCount} student{option.studentCount === 1 ? '' : 's'} · {todayLabel}
          </p>
        </div>

        {option.todaySheet === null && canCreate && !noStudents ? (
          <Button onClick={start} loading={starting}>
            Start attendance
          </Button>
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

      {option.todaySheet ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <span className="flex items-center gap-2 text-sm">
            Attendance already recorded
            <SheetStatusBadge status={option.todaySheet.status} />
          </span>
          <Button variant="secondary" size="sm" asChild>
            <Link href={`/staff/attendance/${option.todaySheet.id}`}>
              {option.todaySheet.status === 'DRAFT'
                ? 'Continue draft'
                : option.todaySheet.status === 'SUBMITTED'
                  ? 'View register'
                  : 'View'}
            </Link>
          </Button>
        </div>
      ) : null}
    </Card>
  )
}
