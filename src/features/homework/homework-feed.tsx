'use client'

import * as React from 'react'
import Link from 'next/link'
import { BookOpen, Paperclip } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/field'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { Pagination } from '@/components/ui/pagination'
import { api, ApiError } from '@/lib/api-client'
import type { PaginatedResult } from '@/server/services/service-utils'
import type { HomeworkRow } from '@/server/services/homework.service'
import { DueBadge } from './shared'

/**
 * A student's homework: their own section, soonest due first. The first page
 * arrives from the server; paging and "show past" go through the same API,
 * which decides what reaches them.
 */
export function HomeworkFeed({ initial }: { initial: PaginatedResult<HomeworkRow> }) {
  const [query, setQuery] = React.useState({ page: 1, includePast: false })
  const [loaded, setLoaded] = React.useState<{ key: string; result: PaginatedResult<HomeworkRow> | null; error: string | null }>({ key: '1|false', result: initial, error: null })
  const key = `${query.page}|${query.includePast}`
  const loading = loaded.key !== key

  React.useEffect(() => {
    if (loaded.key === key) return
    let cancelled = false
    api
      .get<PaginatedResult<HomeworkRow>>(`/api/v1/homework/feed?page=${query.page}&includePast=${query.includePast}`)
      .then((result) => {
        if (!cancelled) setLoaded({ key, result, error: null })
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoaded({ key, result: null, error: e instanceof ApiError ? e.message : 'Homework could not be loaded.' })
      })
    return () => {
      cancelled = true
    }
  }, [key, loaded.key, query.page, query.includePast])

  const result = loaded.result

  return (
    <>
      <Card className="mb-4 p-4">
        <Checkbox label="Show homework whose due date has passed" checked={query.includePast} onChange={(e) => setQuery({ page: 1, includePast: e.target.checked })} />
      </Card>
      <Card>
        {loading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-5 w-1/2" />
          </div>
        ) : loaded.error ? (
          <Alert variant="danger" className="m-4">
            {loaded.error}
          </Alert>
        ) : !result || result.items.length === 0 ? (
          <EmptyState icon={BookOpen} title="No homework" description={query.includePast ? 'Nothing has been set for your section.' : 'Nothing is due. Tick the box above to see past homework.'} />
        ) : (
          <ul className="divide-y divide-border">
            {result.items.map((h) => (
              <li key={h.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <Link href={`/student/homework/${h.id}`} className="font-medium text-foreground hover:text-primary hover:underline">
                    {h.title}
                  </Link>
                  <p className="text-xs text-foreground-muted">
                    {h.subjectName} · {h.teacherName}
                    {h.attachmentCount > 0 ? (
                      <span className="ml-2 inline-flex items-center gap-1">
                        <Paperclip className="h-3 w-3" aria-hidden />
                        {h.attachmentCount} file{h.attachmentCount === 1 ? '' : 's'}
                      </span>
                    ) : null}
                  </p>
                </div>
                <DueBadge due={h.due} />
              </li>
            ))}
          </ul>
        )}
        {result ? <Pagination page={result.page} pageSize={result.pageSize} total={result.total} totalPages={result.totalPages} onPageChange={(p) => setQuery({ ...query, page: p })} disabled={loading} /> : null}
      </Card>
    </>
  )
}
