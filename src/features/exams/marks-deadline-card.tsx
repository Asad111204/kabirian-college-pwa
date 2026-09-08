'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Field, Input } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'

/**
 * The office's marks deadline for one exam (Phase 21).
 *
 * Empty means no deadline, which is how every exam behaved before this phase.
 * After the date, a teacher who needs to finish asks the office, which reopens
 * that one paper from the mark-sheet list — so the date here is a rule, not a
 * wall.
 */
export function MarksDeadlineCard({ examId, deadline, canManage }: { examId: string; deadline: string | null; canManage: boolean }) {
  const router = useRouter()
  const [value, setValue] = React.useState(deadline ?? '')
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const dirty = value !== (deadline ?? '')

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await api.put(`/api/v1/exams/${examId}/marks-deadline`, { marksDeadline: value || undefined })
      toast.success(value ? 'Marks deadline saved.' : 'Marks deadline removed.')
      router.refresh()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'The deadline could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  if (!canManage) {
    return deadline ? (
      <Alert variant="info" className="mb-4">
        Marks for this exam must be entered by <span className="font-medium">{deadline}</span>.
      </Alert>
    ) : null
  }

  return (
    <Card className="mb-4 p-4">
      <form className="flex flex-wrap items-end gap-3" onSubmit={save}>
        <div className="flex items-center gap-2 pb-2 text-sm text-foreground-muted">
          <CalendarClock className="h-4 w-4" aria-hidden />
          Marks deadline
        </div>
        <Field label="Last day for entering marks" htmlFor="marks-deadline" hint="Leave empty for no deadline. The office is never blocked by it.">
          <Input id="marks-deadline" type="date" value={value} onChange={(e) => setValue(e.target.value)} className="max-w-[12rem]" />
        </Field>
        <Button type="submit" size="sm" variant="secondary" loading={saving} disabled={!dirty}>
          Save deadline
        </Button>
        {error ? (
          <Alert variant="danger" className="w-full">
            {error}
          </Alert>
        ) : null}
      </form>
    </Card>
  )
}
