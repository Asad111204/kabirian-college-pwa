'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox, Field, Input } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import { ATTENDANCE_CORRECTION_DAYS_MAX, attendanceRulesSchema } from '@/validation/settings'

export interface AttendanceRulesValue {
  teacherCorrectionDays: number
  leaveCountsAsPresent: boolean
}

/**
 * Settings → Attendance rules.
 *
 * Two rules the office owns: how long a teacher may correct a register they
 * have submitted (0 = only the office), and whether LEAVE counts as present
 * in the percentage. Saved through the API, audited, applied at once.
 */
export function AttendanceRulesCard({ rules }: { rules: AttendanceRulesValue }) {
  const router = useRouter()
  const [days, setDays] = React.useState(String(rules.teacherCorrectionDays))
  const [leave, setLeave] = React.useState(rules.leaveCountsAsPresent)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [fieldError, setFieldError] = React.useState<string | null>(null)

  const dirty = days !== String(rules.teacherCorrectionDays) || leave !== rules.leaveCountsAsPresent

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setFieldError(null)
    const parsed = attendanceRulesSchema.safeParse({ teacherCorrectionDays: days, leaveCountsAsPresent: leave })
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Check the values.')
      return
    }
    setSaving(true)
    try {
      await api.put('/api/v1/settings/attendance', parsed.data)
      toast.success('Attendance rules saved.')
      router.refresh()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The rules could not be saved. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-primary" aria-hidden />
          <CardTitle>Attendance rules</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={save}>
          {error ? <Alert variant="danger">{error}</Alert> : null}
          <Field
            label="Days a teacher may correct a submitted register"
            htmlFor="correction-days"
            hint={`0 means only the office can correct a submitted register. Up to ${ATTENDANCE_CORRECTION_DAYS_MAX}. Every correction is recorded in the audit log either way.`}
            error={fieldError ?? undefined}
          >
            <Input id="correction-days" type="number" inputMode="numeric" min={0} max={ATTENDANCE_CORRECTION_DAYS_MAX} value={days} onChange={(e) => setDays(e.target.value)} className="max-w-[8rem]" />
          </Field>
          <Checkbox
            label="Leave counts as present"
            description="When ticked, a student on approved leave is not marked down in their attendance percentage."
            checked={leave}
            onChange={(e) => setLeave(e.target.checked)}
          />
          <div className="flex justify-end">
            <Button type="submit" loading={saving} disabled={!dirty}>
              Save rules
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
