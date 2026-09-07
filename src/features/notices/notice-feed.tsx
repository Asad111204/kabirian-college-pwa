'use client'

import * as React from 'react'
import { Megaphone, Paperclip } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/field'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { Pagination } from '@/components/ui/pagination'
import { api, ApiError } from '@/lib/api-client'
import type { PaginatedResult } from '@/server/services/service-utils'
import type { FeedNotice } from '@/server/services/notices.service'
import { NOTICE_CATEGORIES, NOTICE_CATEGORY_LABEL } from '@/validation/notices'
import { CategoryBadge, PinnedBadge, formatCollegeLocal } from './shared'

/**
 * The notices that reach the signed-in reader.
 *
 * Read-only. The list comes from /api/v1/notices/feed, which decides what to
 * show from who is asking; the only thing this screen sends is a category and
 * a page number. There is no draft, no archive and no other audience here to
 * ask for, because the API offers none.
 */
export function NoticeFeed({ initial }: { initial: PaginatedResult<FeedNotice> }) {
  const [result, setResult] = React.useState(initial)
  const [category, setCategory] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState<Set<string>>(new Set())

  async function load(next: { category?: string; page?: number }) {
    const c = next.category ?? category
    const page = next.page ?? 1
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (c) params.set('category', c)
      if (page > 1) params.set('page', String(page))
      const query = params.toString()
      setResult(await api.get<PaginatedResult<FeedNotice>>(`/api/v1/notices/feed${query ? `?${query}` : ''}`))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : 'The notices could not be loaded. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="feed-category">
          Category
        </label>
        <Select
          id="feed-category"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value)
            void load({ category: e.target.value, page: 1 })
          }}
          className="w-52"
        >
          <option value="">All categories</option>
          {NOTICE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {NOTICE_CATEGORY_LABEL[c]}
            </option>
          ))}
        </Select>
      </div>

      {error ? <Alert variant="danger">{error}</Alert> : null}

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : result.items.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No notices"
          description={category ? 'Nothing in this category right now.' : 'There is nothing for you at the moment.'}
        />
      ) : (
        <ul className="space-y-3">
          {result.items.map((notice) => {
            const expanded = open.has(notice.id)
            const long = notice.body.length > 280
            return (
              <li key={notice.id}>
                <Card className="p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <CategoryBadge category={notice.category} />
                    {notice.isPinned ? <PinnedBadge /> : null}
                    <span className="text-xs text-foreground-muted">{formatCollegeLocal(notice.publishAtLocal)}</span>
                  </div>
                  <h3 className="mt-2 text-base font-semibold text-foreground">{notice.title}</h3>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {long && !expanded ? `${notice.body.slice(0, 280).trimEnd()}…` : notice.body}
                  </p>
                  {long ? (
                    <button
                      type="button"
                      onClick={() => toggle(notice.id)}
                      className="mt-1 text-sm text-primary hover:underline"
                    >
                      {expanded ? 'Show less' : 'Read more'}
                    </button>
                  ) : null}
                  {notice.attachments.length > 0 ? (
                    <ul className="mt-3 space-y-1">
                      {notice.attachments.map((file) => (
                        <li key={file.id} className="flex items-center gap-2 text-sm">
                          <Paperclip className="h-3.5 w-3.5 shrink-0 text-foreground-muted" aria-hidden />
                          <a
                            href={`/api/v1/documents/${file.id}/content`}
                            target="_blank"
                            rel="noreferrer"
                            className="truncate text-primary hover:underline"
                          >
                            {file.originalFileName}
                          </a>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Card>
              </li>
            )
          })}
        </ul>
      )}

      {result.totalPages > 1 ? (
        <Pagination
          page={result.page}
          pageSize={result.pageSize}
          total={result.total}
          totalPages={result.totalPages}
          onPageChange={(page) => void load({ page })}
          disabled={loading}
        />
      ) : null}
    </div>
  )
}
