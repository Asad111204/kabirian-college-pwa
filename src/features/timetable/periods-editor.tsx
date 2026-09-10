'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/field'
import { Alert } from '@/components/ui/feedback'
import { api, ApiError } from '@/lib/api-client'
import type { CollegePeriod } from '@/server/timetable/periods'

/** A row being edited: the times are text until they are saved. */
interface Row {
  key: string
  period: string
  start: string
  end: string
}

const toRows = (periods: CollegePeriod[]): Row[] =>
  periods.map((period) => ({
    key: `p${period.period}`,
    period: String(period.period),
    start: period.start,
    end: period.end,
  }))

/**
 * The college day, as the office keeps it.
 *
 * The times used to be a constant in the code, with one period marked as the
 * break and nothing allowed in it. Both are gone: the college rings its own
 * bells, and a break is a period they simply do not fill — which needs no flag
 * and no rule.
 *
 * A lesson stores a period *number*, never a time, so moving a bell here moves
 * every lesson in that period with it and nothing has to be rewritten. That is
 * also why a period with lessons or registers against it cannot be deleted:
 * its number is written on those rows. The server refuses that and says which
 * period and why; the button is only a courtesy.
 */
export function PeriodsEditor({ initial }: { initial: CollegePeriod[] }) {
  const [rows, setRows] = React.useState<Row[]>(toRows(initial))
  const [saved, setSaved] = React.useState<Row[]>(toRows(initial))
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [problems, setProblems] = React.useState<string[]>([])

  const dirty = JSON.stringify(rows) !== JSON.stringify(saved)
  const nextNumber = Math.max(0, ...rows.map((row) => Number(row.period) || 0)) + 1

  function set(key: string, field: 'period' | 'start' | 'end', value: string) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, [field]: value } : row)))
  }

  async function save() {
    setBusy(true)
    setError(null)
    setProblems([])
    try {
      const periods = await api.put<CollegePeriod[]>('/api/v1/timetable/periods', {
        periods: rows.map((row) => ({ period: Number(row.period), start: row.start, end: row.end })),
      })
      setRows(toRows(periods))
      setSaved(toRows(periods))
      toast.success('The college day has been updated.')
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
        setProblems(err.fields?.periods ?? [])
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>The college day</CardTitle>
        <CardDescription>
          The periods the bells ring for. A lesson records which period it is in, never a time, so
          changing a time here moves every lesson in that period with it.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="danger" title={error}>
            {problems.length > 0 ? (
              <ul className="mt-1 space-y-0.5 text-xs">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            ) : null}
          </Alert>
        ) : null}

        <Alert variant="info">
          There is no break period any more. A break is simply an hour the college does not fill —
          leave a gap between two periods, or keep a period and put nothing in it.
        </Alert>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] border-collapse text-sm">
            <thead>
              <tr>
                <th scope="col" className="border border-border bg-surface-muted px-2 py-1.5 text-left text-xs font-semibold">
                  Period
                </th>
                <th scope="col" className="border border-border bg-surface-muted px-2 py-1.5 text-left text-xs font-semibold">
                  Starts
                </th>
                <th scope="col" className="border border-border bg-surface-muted px-2 py-1.5 text-left text-xs font-semibold">
                  Ends
                </th>
                <th scope="col" className="border border-border bg-surface-muted px-2 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="border border-border px-2 py-1.5">
                    <Input
                      aria-label={`Period number for the row starting ${row.start}`}
                      value={row.period}
                      inputMode="numeric"
                      className="w-20"
                      disabled={busy}
                      onChange={(e) => set(row.key, 'period', e.target.value)}
                    />
                  </td>
                  <td className="border border-border px-2 py-1.5">
                    <Input
                      aria-label={`Start time for period ${row.period}`}
                      type="time"
                      value={row.start}
                      className="w-32"
                      disabled={busy}
                      onChange={(e) => set(row.key, 'start', e.target.value)}
                    />
                  </td>
                  <td className="border border-border px-2 py-1.5">
                    <Input
                      aria-label={`End time for period ${row.period}`}
                      type="time"
                      value={row.end}
                      className="w-32"
                      disabled={busy}
                      onChange={(e) => set(row.key, 'end', e.target.value)}
                    />
                  </td>
                  <td className="border border-border px-2 py-1.5 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy || rows.length === 1}
                      aria-label={`Remove period ${row.period}`}
                      onClick={() => setRows((current) => current.filter((other) => other.key !== row.key))}
                    >
                      <Trash2 className="h-4 w-4 text-danger-600" aria-hidden />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() =>
              setRows((current) => [
                ...current,
                {
                  key: `new-${Date.now()}`,
                  period: String(nextNumber),
                  start: current[current.length - 1]?.end ?? '08:00',
                  end: current[current.length - 1]?.end ?? '08:00',
                },
              ])
            }
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add a period
          </Button>

          <p className="mr-auto text-xs text-foreground-muted">
            {rows.length} period{rows.length === 1 ? '' : 's'} in the day
          </p>

          {dirty ? (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRows(saved)}>
              Undo changes
            </Button>
          ) : null}
          <Button onClick={save} loading={busy} disabled={!dirty}>
            Save the day
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
