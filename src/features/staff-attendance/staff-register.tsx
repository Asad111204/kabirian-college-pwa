'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarDays, Check, Save, Search, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { OnlineOnlyButton } from '@/components/pwa/online-only-button'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/avatar'
import { Input, Select } from '@/components/ui/field'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import { cn } from '@/lib/cn'
import type { StaffAttendanceDay } from '@/server/services/staff-attendance.service'
import { STAFF_ATTENDANCE_STATUSES, STAFF_ATTENDANCE_STATUS_LABEL, type StaffAttendanceStatusValue } from '@/server/staff-attendance/staff-attendance-policy'

const TONE: Record<StaffAttendanceStatusValue, string> = {
  PRESENT: 'bg-success-600 text-white border-success-600',
  ABSENT: 'bg-danger-600 text-white border-danger-600',
  SHORT_LEAVE: 'bg-warning-600 text-white border-warning-600',
  LEAVE: 'bg-info-600 text-white border-info-600',
}

/**
 * Admin → Staff Attendance: one day's register for the whole staff.
 *
 * Everyone employed that day is listed with four buttons. Nothing is stored
 * until Save, and the day's date comes from the server — a register for
 * tomorrow is refused there, not merely hidden here.
 */
export function StaffRegister({ day: initial, canMark }: { day: StaffAttendanceDay; canMark: boolean }) {
  const router = useRouter()
  const [day, setDay] = React.useState(initial)
  const [marks, setMarks] = React.useState<Record<string, StaffAttendanceStatusValue>>(() =>
    Object.fromEntries(initial.rows.filter((r) => r.status).map((r) => [r.staffId, r.status!])),
  )
  const [search, setSearch] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  // A new day (or new filters) arrives as a fresh page render: adopt it.
  const [seen, setSeen] = React.useState(initial.date)
  if (initial.date !== seen) {
    setSeen(initial.date)
    setDay(initial)
    setMarks(Object.fromEntries(initial.rows.filter((r) => r.status).map((r) => [r.staffId, r.status!])))
  }

  const editable = canMark && day.editable
  const dirty = day.rows.some((r) => (marks[r.staffId] ?? null) !== r.status)

  const visible = React.useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return day.rows
    return day.rows.filter((r) => r.fullName.toLowerCase().includes(term) || r.staffCode.toLowerCase().includes(term) || (r.department ?? '').toLowerCase().includes(term))
  }, [day.rows, search])

  const live = React.useMemo(() => {
    const counts = { present: 0, absent: 0, shortLeave: 0, leave: 0, unmarked: 0 }
    for (const row of day.rows) {
      const status = marks[row.staffId]
      if (!status) counts.unmarked += 1
      else if (status === 'PRESENT') counts.present += 1
      else if (status === 'ABSENT') counts.absent += 1
      else if (status === 'SHORT_LEAVE') counts.shortLeave += 1
      else counts.leave += 1
    }
    return counts
  }, [day.rows, marks])

  function goToDate(date: string) {
    router.push(date ? `/admin/staff-attendance?date=${date}` : '/admin/staff-attendance')
  }

  function markAllPresent() {
    setMarks(Object.fromEntries(day.rows.map((r) => [r.staffId, 'PRESENT' as const])))
    toast.success('Everyone marked present. Change the ones who were not, then save.')
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const entries = day.rows.filter((r) => marks[r.staffId]).map((r) => ({ staffId: r.staffId, status: marks[r.staffId]! }))
      if (entries.length === 0) {
        setError('Mark at least one person before saving.')
        return
      }
      const saved = await api.put<StaffAttendanceDay>('/api/v1/staff-attendance', { date: day.date, entries })
      setDay(saved)
      setMarks(Object.fromEntries(saved.rows.filter((r) => r.status).map((r) => [r.staffId, r.status!])))
      toast.success('Staff attendance saved.')
      router.refresh()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The register could not be saved. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Card className="mb-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2 pb-2 text-sm text-foreground-muted">
            <CalendarDays className="h-4 w-4" aria-hidden />
            Date
          </div>
          <Input type="date" value={day.date} onChange={(e) => goToDate(e.target.value)} aria-label="Register date" className="max-w-[12rem]" />
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" aria-hidden />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name, code or department…" aria-label="Search staff" className="pl-9" />
          </div>
          <Select
            defaultValue=""
            onChange={(e) => router.push(`/admin/staff-attendance?date=${day.date}${e.target.value ? `&departmentId=${e.target.value}` : ''}`)}
            aria-label="Filter by department"
            className="w-auto max-w-full"
          >
            <option value="">All departments</option>
            {day.departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          {editable ? (
            <Button type="button" variant="secondary" size="sm" onClick={markAllPresent}>
              <Check className="h-4 w-4" />
              All present
            </Button>
          ) : null}
        </div>
      </Card>

      {!day.editable ? (
        <Alert variant="warning" className="mb-4">
          {day.reason}
        </Alert>
      ) : null}
      {day.editable && !canMark ? (
        <Alert variant="info" className="mb-4">
          You can see the staff register but not change it. Marking needs the “mark and correct staff attendance” permission.
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="danger" className="mb-4" title="Not saved">
          {error}
        </Alert>
      ) : null}

      <Card className="mb-4 p-4">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          {[
            ['Present', live.present],
            ['Absent', live.absent],
            ['Short leave', live.shortLeave],
            ['Leave', live.leave],
            ['Not marked', live.unmarked],
          ].map(([label, value]) => (
            <div key={label as string}>
              <dt className="text-xs text-foreground-muted">{label}</dt>
              <dd className="font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {day.rows.length === 0 ? (
        <Card>
          <EmptyState icon={Users} title="Nobody to mark" description="No staff member was employed on this date, or the filters exclude everyone." />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-border">
            {visible.map((row) => (
              <li key={row.staffId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={row.fullName} src={row.photoId ? `/api/v1/staff/${row.staffId}/photo?v=${row.photoId}` : null} size="sm" />
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{row.fullName}</p>
                    <p className="truncate text-xs text-foreground-muted">
                      {row.staffCode} · {row.designation}
                      {row.department ? ` · ${row.department}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`Attendance for ${row.fullName}`}>
                  {STAFF_ATTENDANCE_STATUSES.map((status) => {
                    const chosen = marks[row.staffId] === status
                    return (
                      <button
                        key={status}
                        type="button"
                        role="radio"
                        aria-checked={chosen}
                        aria-label={`${STAFF_ATTENDANCE_STATUS_LABEL[status]} — ${row.fullName}`}
                        disabled={!editable}
                        onClick={() => setMarks((current) => ({ ...current, [row.staffId]: status }))}
                        className={cn(
                          'rounded-[var(--radius-control)] border px-2.5 py-1.5 text-xs font-medium transition-colors',
                          chosen ? TONE[status] : 'border-border bg-surface text-foreground-muted hover:bg-surface-muted',
                          !editable && 'cursor-not-allowed opacity-60',
                        )}
                      >
                        {STAFF_ATTENDANCE_STATUS_LABEL[status]}
                      </button>
                    )
                  })}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {editable && day.rows.length > 0 ? (
        <div className="sticky bottom-0 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-border bg-surface p-3 shadow-lg">
          <p className="text-sm text-foreground-muted" aria-live="polite">
            {dirty ? 'Unsaved changes' : 'No changes'}
          </p>
          <OnlineOnlyButton onClick={save} loading={saving} disabled={!dirty}>
            <Save className="h-4 w-4" aria-hidden />
            Save register
          </OnlineOnlyButton>
        </div>
      ) : null}
    </>
  )
}
