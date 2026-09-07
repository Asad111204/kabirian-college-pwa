import * as React from 'react'
import { Archive, Ban, CalendarCheck, FileEdit, Megaphone, Pin } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import {
  EVENT_STATUS_LABEL,
  NOTICE_CATEGORY_LABEL,
  PUBLISH_STATUS_LABEL,
  type EventStatusValue,
  type NoticeCategoryValue,
  type PublishStatusValue,
} from '@/validation/notices'

/**
 * The small pieces every notice and event screen shares.
 *
 * No `'use client'`: presentational, so either side of the boundary can render
 * them. A status always carries a word as well as a colour.
 */

const PUBLISH_STYLE: Record<
  PublishStatusValue,
  { variant: 'neutral' | 'success' | 'warning' | 'danger' | 'info'; Icon: React.ComponentType<{ className?: string }> }
> = {
  DRAFT: { variant: 'neutral', Icon: FileEdit },
  PUBLISHED: { variant: 'success', Icon: Megaphone },
  ARCHIVED: { variant: 'warning', Icon: Archive },
}

export function NoticeStatusBadge({ status }: { status: PublishStatusValue }) {
  const { variant, Icon } = PUBLISH_STYLE[status] ?? PUBLISH_STYLE.DRAFT
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3 w-3" aria-hidden />
      {PUBLISH_STATUS_LABEL[status] ?? status}
    </Badge>
  )
}

const EVENT_STYLE: Record<
  EventStatusValue,
  { variant: 'neutral' | 'success' | 'warning' | 'danger' | 'info'; Icon: React.ComponentType<{ className?: string }> }
> = {
  DRAFT: { variant: 'neutral', Icon: FileEdit },
  PUBLISHED: { variant: 'success', Icon: CalendarCheck },
  CANCELLED: { variant: 'danger', Icon: Ban },
}

export function EventStatusBadge({ status }: { status: EventStatusValue }) {
  const { variant, Icon } = EVENT_STYLE[status] ?? EVENT_STYLE.DRAFT
  return (
    <Badge variant={variant} className="gap-1">
      <Icon className="h-3 w-3" aria-hidden />
      {EVENT_STATUS_LABEL[status] ?? status}
    </Badge>
  )
}

export function CategoryBadge({ category }: { category: NoticeCategoryValue }) {
  return (
    <Badge variant={category === 'EMERGENCY' ? 'danger' : 'info'}>
      {NOTICE_CATEGORY_LABEL[category] ?? category}
    </Badge>
  )
}

export function PinnedBadge() {
  return (
    <Badge variant="neutral" className="gap-1">
      <Pin className="h-3 w-3" aria-hidden />
      Pinned
    </Badge>
  )
}

/**
 * `2026-09-08T08:00` → `8 Sep 2026, 08:00`.
 *
 * The value is already on the college's clock (the server converted it), so it
 * is formatted as the digits it carries and never shifted by the reader's zone
 * — the same care `formatExamDate` takes with a date sheet.
 */
export function formatCollegeLocal(local: string | null | undefined): string {
  if (!local || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) return '—'
  const date = new Date(`${local}:00Z`)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(date)
}

/** `08:00 on 8 Sep 2026` for the window sentence, or "immediately". */
export function windowSentence(publishAtLocal: string, expiresAtLocal: string | null): string {
  const from = formatCollegeLocal(publishAtLocal)
  return expiresAtLocal ? `${from} until ${formatCollegeLocal(expiresAtLocal)}` : `${from} onwards`
}
