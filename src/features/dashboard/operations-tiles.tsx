import {
  CalendarDays,
  CalendarX2,
  ClipboardCheck,
  FileText,
  FolderOpen,
  Megaphone,
  Percent,
  ScrollText,
} from 'lucide-react'
import type { OperationsStatistics } from '@/server/services/dashboard.service'
import { StatTile } from './stat-tiles'

/**
 * What is happening today and this session, for the office.
 *
 * Every tile is a real count from the service. A block is simply absent when
 * the administrator cannot see that module, and "no figure yet" is said in
 * words rather than shown as a zero that would read as "nobody came".
 */
export function TodayTiles({ operations, today }: { operations: OperationsStatistics; today: string }) {
  const a = operations.attendance
  const c = operations.communication
  if (!a && !c) return null
  return (
    <section className="mb-5" aria-label="Today">
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-foreground-muted uppercase">Today · {today}</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {a ? (
          <StatTile
            label="Registers taken today"
            value={`${a.sectionsWithRegisterToday} / ${a.sections}`}
            icon={ClipboardCheck}
            href="/admin/attendance"
            hint={a.draftToday > 0 ? `${a.submittedToday} submitted · ${a.draftToday} still draft` : `${a.submittedToday} submitted`}
            emphasis={a.sections > 0 && a.sectionsWithRegisterToday < a.sections}
          />
        ) : null}
        {a ? (
          <StatTile
            label="Attendance this month"
            value={a.monthPercentage === null ? '—' : `${a.monthPercentage}%`}
            icon={Percent}
            href="/admin/attendance/reports"
            hint={a.monthEntries === 0 ? 'No attendance submitted yet this month' : `${a.monthEntries.toLocaleString()} entries`}
          />
        ) : null}
        {c ? (
          <StatTile
            label="Notices showing"
            value={c.noticesShowing}
            icon={Megaphone}
            href="/admin/notices"
            hint="Published and within their window"
          />
        ) : null}
        {c ? (
          <StatTile
            label="Events in the next 30 days"
            value={c.eventsNext30Days}
            icon={CalendarDays}
            href="/admin/events"
          />
        ) : null}
      </div>
    </section>
  )
}

export function SessionTiles({ operations, sessionName }: { operations: OperationsStatistics; sessionName: string | null }) {
  const e = operations.exams
  const t = operations.timetable
  const d = operations.documents
  if (!e && !t && !d) return null
  return (
    <section className="mb-5" aria-label="This session">
      <h2 className="mb-2 text-xs font-semibold tracking-wide text-foreground-muted uppercase">
        {sessionName ? `Session ${sessionName}` : 'This session'}
      </h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {e ? (
          <StatTile
            label="Exams in progress"
            value={e.inProgress}
            icon={FileText}
            href="/admin/exams"
            hint={e.markSheetsOpen > 0 ? `${e.markSheetsOpen} mark sheet${e.markSheetsOpen === 1 ? '' : 's'} still open` : 'No mark sheets open'}
          />
        ) : null}
        {e ? (
          <StatTile
            label="Results awaiting publication"
            value={e.resultsAwaitingPublication}
            icon={ScrollText}
            href="/admin/exams"
            hint={`${e.resultsPublished} published`}
            emphasis={e.resultsAwaitingPublication > 0}
          />
        ) : null}
        {t ? (
          <StatTile
            label="Sections with a timetable"
            value={`${t.sectionsWithLessons} / ${t.sections}`}
            icon={CalendarX2}
            href="/admin/timetable"
            hint={t.sections - t.sectionsWithLessons > 0 ? `${t.sections - t.sectionsWithLessons} still empty` : 'Every section has lessons'}
          />
        ) : null}
        {d ? (
          <StatTile
            label="Students missing a required document"
            value={d.studentsMissingRequired}
            icon={FolderOpen}
            href="/admin/students"
            emphasis={d.studentsMissingRequired > 0}
          />
        ) : null}
      </div>
    </section>
  )
}
