'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { MessageSquarePlus, MessagesSquare, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Input, Select } from '@/components/ui/field'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { Pagination } from '@/components/ui/pagination'
import { formatDateTime } from '@/lib/format'
import { COMPLAINT_CATEGORIES, COMPLAINT_CATEGORY_LABEL, COMPLAINT_STATUSES, COMPLAINT_STATUS_LABEL } from '@/server/complaints/complaints-policy'
import type { ComplaintRow } from '@/server/services/complaints.service'
import type { PaginatedResult } from '@/server/services/service-utils'
import { ComplaintFormDialog } from './complaint-form-dialog'

/**
 * The list of applications, for a student (their own) or the office (all).
 *
 * The same component serves both because the row is the same row; what
 * differs is who is named on it and what may be done from it. `mine` says
 * which side is reading.
 */
export function ComplaintList({ page: initial, mine, basePath }: { page: PaginatedResult<ComplaintRow>; mine: boolean; basePath: string }) {
  const router = useRouter()
  const [writing, setWriting] = React.useState(false)

  const go = (params: Record<string, string>) => {
    const search = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) if (value) search.set(key, value)
    const query = search.toString()
    router.push(query ? `${basePath}?${query}` : basePath)
  }

  return (
    <>
      {mine ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-foreground-muted">Only you and the office can read what you write here.</p>
            <Button type="button" onClick={() => setWriting(true)}>
              <MessageSquarePlus className="h-4 w-4" aria-hidden />
              Write to the office
            </Button>
          </div>
          <ComplaintFormDialog open={writing} onOpenChange={setWriting} onSent={(sent) => router.push(`${basePath}/${sent.id}`)} />
        </>
      ) : (
        <Card className="mb-4 p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-subtle" aria-hidden />
              <Input
                defaultValue=""
                placeholder="Search by subject or student…"
                aria-label="Search applications"
                className="pl-9"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') go({ search: (e.target as HTMLInputElement).value })
                }}
              />
            </div>
            <Select defaultValue="" aria-label="Filter by state" onChange={(e) => go({ status: e.target.value })} className="w-auto max-w-full">
              <option value="">Any state</option>
              {COMPLAINT_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {COMPLAINT_STATUS_LABEL[value]}
                </option>
              ))}
            </Select>
            <Select defaultValue="" aria-label="Filter by subject area" onChange={(e) => go({ category: e.target.value })} className="w-auto max-w-full">
              <option value="">Anything</option>
              {COMPLAINT_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {COMPLAINT_CATEGORY_LABEL[value]}
                </option>
              ))}
            </Select>
            <Button type="button" variant="secondary" size="sm" onClick={() => go({ awaitingOffice: 'true' })}>
              Waiting on us
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => go({})}>
              Clear
            </Button>
          </div>
        </Card>
      )}

      {initial.items.length === 0 ? (
        <Card>
          <EmptyState
            icon={MessagesSquare}
            title={mine ? 'You have not written to the office' : 'No applications'}
            description={
              mine
                ? 'If something is wrong — your attendance, a fee, a class — write to the office and somebody will answer you.'
                : 'Nothing matches these filters.'
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {initial.items.map((row) => (
            <Card key={row.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link href={`${basePath}/${row.id}`} className="font-medium text-foreground hover:underline">
                    {row.subject}
                  </Link>
                  <p className="mt-0.5 text-xs text-foreground-muted">
                    {row.categoryLabel}
                    {mine ? '' : ` · ${row.studentName} · ${row.studentCode}`}
                    {!mine && row.sectionLabel ? ` · ${row.sectionLabel}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-foreground-subtle">
                    Written {formatDateTime(row.createdAt)}
                    {row.replyCount > 0 ? ` · ${row.replyCount} message${row.replyCount === 1 ? '' : 's'}` : ' · no reply yet'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {row.awaiting === 'OFFICE' ? (
                    <Badge variant="warning">{mine ? 'With the office' : `Waiting ${row.waitingDays} day${row.waitingDays === 1 ? '' : 's'}`}</Badge>
                  ) : null}
                  {row.awaiting === 'STUDENT' ? <Badge variant="info">{mine ? 'Your turn' : 'Waiting on the student'}</Badge> : null}
                  <Badge variant={row.statusTone}>{row.statusLabel}</Badge>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {initial.total > initial.pageSize ? (
        <div className="mt-4">
          <Pagination
            page={initial.page}
            pageSize={initial.pageSize}
            total={initial.total}
            totalPages={initial.totalPages}
            onPageChange={(next) => go({ page: String(next) })}
          />
        </div>
      ) : null}

      {mine && initial.items.some((row) => row.status === 'SUBMITTED') ? (
        <Alert variant="info" className="mt-4">
          The office answers applications in the order they arrive. You will see the reply here.
        </Alert>
      ) : null}
    </>
  )
}
