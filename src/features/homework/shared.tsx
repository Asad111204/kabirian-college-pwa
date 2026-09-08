import { Badge } from '@/components/ui/badge'
import type { HomeworkRow } from '@/server/services/homework.service'

/** "1st Year · Boys · Pre-Medical · Section A" */
export function placementLabel(h: Pick<HomeworkRow, 'className' | 'divisionName' | 'programName' | 'sectionName'>): string {
  return `${h.className} · ${h.divisionName} · ${h.programName} · Section ${h.sectionName}`
}

const TONE = { neutral: 'neutral', warning: 'warning', danger: 'danger' } as const

/** The due date in words, coloured by urgency; "No due date" when there is none. */
export function DueBadge({ due }: { due: HomeworkRow['due'] }) {
  if (!due) return <Badge variant="neutral">No due date</Badge>
  return <Badge variant={TONE[due.tone]}>{due.label}</Badge>
}

/** 29 Aug 2026, from a YYYY-MM-DD college date, without a time zone shift. */
export function formatCollegeDate(date: string | null): string {
  if (!date) return '—'
  const [y, m, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(y!, m! - 1, d!)))
}
