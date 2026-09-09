import type { Metadata } from 'next'
import Link from 'next/link'
import { BadgeCheck, FileText, ScrollText, Users } from 'lucide-react'
import { requirePortalAccess } from '@/server/auth/context'
import { getResultOverview } from '@/server/services/results.service'
import { PageHeader } from '@/components/layout/app-shell'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { StatTile } from '@/features/dashboard/stat-tiles'
import { formatDate } from '@/lib/format'
import { EXAM_STATUS_LABEL } from '@/validation/exams'

export const metadata: Metadata = { title: 'Results' }
export const dynamic = 'force-dynamic'

/**
 * Admin → Results: the college's results, exam by exam.
 *
 * Each exam's results have always lived behind that exam. What was missing was
 * the view across all of them — which have been generated, which are published,
 * and how each one went — so the office could see the year rather than one
 * paper at a time. Every figure here is counted in the database; nothing is
 * recalculated on the page, and nothing new is decided by it.
 */
export default async function ResultsOverviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requirePortalAccess(['ADMIN'])
  const search = await searchParams
  const requested = typeof search.sessionId === 'string' ? search.sessionId : undefined

  const overview = await getResultOverview(ctx, requested)

  return (
    <>
      <PageHeader
        title="Results"
        description={`Every exam in ${overview.academicSessionName}, and where its results stand.`}
        actions={
          overview.sessions.length > 1 ? (
            <div className="flex flex-wrap gap-1">
              {overview.sessions.map((session) => (
                <Button
                  key={session.id}
                  size="sm"
                  variant={session.id === overview.academicSessionId ? 'secondary' : 'ghost'}
                  asChild
                >
                  <Link href={`/admin/results?sessionId=${session.id}`}>{session.name}</Link>
                </Button>
              ))}
            </div>
          ) : null
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Exams" value={overview.totals.exams} icon={FileText} />
        <StatTile label="With results" value={overview.totals.withResults} icon={ScrollText} />
        <StatTile label="Published" value={overview.totals.published} icon={BadgeCheck} />
        <StatTile label="Results held" value={overview.totals.students} icon={Users} />
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Exams</CardTitle>
        </CardHeader>
        <CardContent>
          {overview.rows.length === 0 ? (
            <EmptyState
              icon={ScrollText}
              title="No exams in this session yet"
              description="Results appear here once an exam has been created and its marks turned into results."
              action={
                <Button asChild>
                  <Link href="/admin/exams">Go to Exams</Link>
                </Button>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Exam</TH>
                  <TH>Dates</TH>
                  <TH className="text-right">Results</TH>
                  <TH className="text-right">Passed</TH>
                  <TH className="text-right">Failed</TH>
                  <TH className="text-right">Incomplete</TH>
                  <TH className="text-right">Pass rate</TH>
                  <TH>Published</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {overview.rows.map((row) => (
                  <TR key={row.examId}>
                    <TD>
                      <p className="font-medium">{row.examName}</p>
                      <p className="text-xs text-foreground-muted">
                        {row.examType} · {EXAM_STATUS_LABEL[row.status] ?? row.status}
                      </p>
                    </TD>
                    <TD className="text-xs text-foreground-muted">
                      {row.startDate ? formatDate(row.startDate) : '—'}
                      {row.endDate ? ` – ${formatDate(row.endDate)}` : ''}
                    </TD>
                    <TD className="text-right tabular-nums">{row.total || '—'}</TD>
                    <TD className="text-right tabular-nums">{row.total ? row.passed : '—'}</TD>
                    <TD className="text-right tabular-nums">{row.total ? row.failed : '—'}</TD>
                    <TD className="text-right tabular-nums">{row.total ? row.incomplete : '—'}</TD>
                    <TD className="text-right tabular-nums">
                      {row.passPercentage === null ? '—' : `${row.passPercentage}%`}
                    </TD>
                    <TD>
                      {row.total === 0 ? (
                        <span className="text-xs text-foreground-muted">Not generated</span>
                      ) : row.published === row.total ? (
                        <Badge variant="success">Published</Badge>
                      ) : row.published > 0 ? (
                        <Badge variant="warning">{row.published} of {row.total}</Badge>
                      ) : (
                        <Badge variant="neutral">Held back</Badge>
                      )}
                    </TD>
                    <TD className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/exams/${row.examId}/results`}>Open</Link>
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Alert variant="info" className="mt-4">
        Results are generated and published from inside each exam, where the mark sheets are. A pass
        rate counts only the students with a complete result — anyone still missing a mark is
        counted as incomplete rather than as a failure.
      </Alert>
    </>
  )
}
