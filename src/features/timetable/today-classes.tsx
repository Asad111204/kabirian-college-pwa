import * as React from 'react'
import Link from 'next/link'
import { CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/feedback'
import type { TodayClasses } from '@/server/services/timetable.service'
import { DAY_LABEL } from '@/validation/timetable'

/**
 * What this teacher is teaching today, on their own dashboard.
 *
 * Presentational only. The lessons have already been narrowed by the service to
 * the signed-in teacher, and "today" is the college's own weekday in
 * Asia/Karachi decided on the server — a laptop with a wrong clock must not
 * change which classes a teacher is told to take.
 *
 * A day with nothing on it says so. It never falls back to the whole week, and
 * it never shows another teacher's lesson.
 */
export function TodayClassesCard({ today }: { today: TodayClasses }) {
  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Today’s classes</CardTitle>
          <p className="mt-0.5 text-sm text-foreground-muted">
            {DAY_LABEL[today.dayOfWeek]} · {today.date}
          </p>
        </div>
        <Button variant="secondary" size="sm" asChild>
          <Link href="/staff/timetable">Full week</Link>
        </Button>
      </CardHeader>
      <CardContent>
        {today.lessons.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Nothing timetabled today"
            description="You have no lessons on the timetable for today."
          />
        ) : (
          <ol className="divide-y divide-border">
            {today.lessons.map((lesson) => (
              <li key={lesson.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="w-20 shrink-0">
                  <p className="text-sm font-semibold text-foreground tabular-nums">
                    {lesson.startTime}
                  </p>
                  <p className="text-[11px] text-foreground-muted tabular-nums">
                    to {lesson.endTime}
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {lesson.subjectName}
                  </p>
                  <p className="truncate text-xs text-foreground-muted">
                    {lesson.className} · {lesson.divisionName} · {lesson.programName} · Section{' '}
                    {lesson.sectionName}
                    {lesson.room ? ` · ${lesson.room}` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-foreground-muted">
                  Period {lesson.period}
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  )
}
