import * as React from 'react'
import Link from 'next/link'
import { ChevronRight, Trophy } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import { formatDate } from '@/lib/format'
import type { ResultRow } from '@/server/services/results.service'
import { marksLabel, OutcomeBadge, percentageLabel, positionLabel } from './shared'

/**
 * Student → My Results.
 *
 * Cards rather than a table: a student is almost always on a phone, and six
 * columns of a result table do not fit one. No `'use client'` — the list is
 * read-only, so it renders on the server and ships no JavaScript.
 *
 * Only published results ever reach this component; the service does not return
 * anything else.
 */
export function StudentResults({ results }: { results: ResultRow[] }) {
  if (results.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Trophy}
          title="No published results yet"
          description="Your results appear here once the college publishes them."
        />
      </Card>
    )
  }

  return (
    <ul className="space-y-3">
      {results.map((result) => {
        const incomplete = result.outcome === 'INCOMPLETE'
        return (
          <li key={result.id}>
            <Card className="transition-colors hover:border-border-strong">
              <Link
                href={`/student/results/${result.id}`}
                className="block p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{result.examName}</p>
                    <p className="text-xs text-foreground-muted">
                      {result.examTypeName} · {result.sessionName}
                      {result.publishedAt ? ` · published ${formatDate(result.publishedAt)}` : ''}
                    </p>
                  </div>
                  <ChevronRight
                    className="mt-0.5 h-5 w-5 shrink-0 text-foreground-subtle"
                    aria-hidden
                  />
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-foreground-muted">Marks</dt>
                    <dd className="font-medium tabular-nums">
                      {marksLabel(result.totalObtainedMarks)} / {marksLabel(result.totalMaxMarks)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-foreground-muted">Percentage</dt>
                    <dd className="font-medium tabular-nums">
                      {percentageLabel(result.percentage)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-foreground-muted">Grade</dt>
                    <dd className="font-medium">{result.grade ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-foreground-muted">Position</dt>
                    <dd className="font-medium">{positionLabel(result.position)}</dd>
                  </div>
                </dl>

                <div className="mt-3">
                  <OutcomeBadge outcome={result.outcome} />
                  {incomplete ? (
                    <span className="ml-2 text-xs text-foreground-muted">
                      Your final result is not yet complete.
                    </span>
                  ) : null}
                </div>
              </Link>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}
