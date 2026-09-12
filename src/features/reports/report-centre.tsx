'use client'

import * as React from 'react'
import { Download, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/field'
import { Alert, EmptyState, Skeleton } from '@/components/ui/feedback'
import { Table, TableWrapper, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { api, ApiError } from '@/lib/api-client'
import { formatDateTime } from '@/lib/format'
import type { EnrollmentOptionGroup } from '@/server/services/students.service'
import type {
  ExamReportOut,
  GroupedReport,
  MissingDocumentRow,
  ResultReportOut,
  StaffReportRow,
  StudentReportRowOut,
} from '@/server/services/reports.service'
import { REPORT_GROUPINGS, REPORT_GROUPING_LABEL, type ReportGrouping } from '@/validation/reports'

export type ReportKind = 'students' | 'staff' | 'missing-documents' | 'exams' | 'results'

export interface ReportOptions {
  sessions: { id: string; name: string; isCurrent: boolean }[]
  groups: EnrollmentOptionGroup[]
  departments: { id: string; name: string }[]
  designations: { id: string; name: string }[]
  exams: { id: string; name: string; sessionName: string; status: string }[]
  collegeName: string
}

const KINDS: { key: ReportKind; label: string }[] = [
  { key: 'students', label: 'Students' },
  { key: 'staff', label: 'Staff' },
  { key: 'missing-documents', label: 'Missing documents' },
  { key: 'exams', label: 'Exam mark sheets' },
  { key: 'results', label: 'Results' },
]

/**
 * The report centre.
 *
 * Every report is one GET with a query string. The screen asks for `format=json`
 * and renders the rows; the CSV button is a plain link to the *same* query with
 * `format=csv`, so what is downloaded is what is on screen -- the API makes it
 * so, not this component. Print uses the browser and the print stylesheet, as
 * the result card does (ADR-138): the report area is `print-area`, and the
 * controls are `print-hide`.
 */
export function ReportCentre({ options, initialKind = 'students' }: { options: ReportOptions; initialKind?: ReportKind }) {
  const [kind, setKind] = React.useState<ReportKind>(initialKind)
  const [sessionId, setSessionId] = React.useState(options.sessions.find((s) => s.isCurrent)?.id ?? options.sessions[0]?.id ?? '')
  const [classId, setClassId] = React.useState('')
  const [divisionId, setDivisionId] = React.useState('')
  const [programId, setProgramId] = React.useState('')
  const [sectionId, setSectionId] = React.useState('')
  const [groupBy, setGroupBy] = React.useState<ReportGrouping>('none')
  const [studentStatus, setStudentStatus] = React.useState('ACTIVE')
  const [departmentId, setDepartmentId] = React.useState('')
  const [designationId, setDesignationId] = React.useState('')
  const [staffGroupBy, setStaffGroupBy] = React.useState<'none' | 'department' | 'designation' | 'type'>('none')
  const [examId, setExamId] = React.useState(options.exams[0]?.id ?? '')
  const [resultGroupBy, setResultGroupBy] = React.useState<'none' | 'class' | 'program' | 'section'>('none')

  // What was last loaded, stamped with the query it answers. "Loading" is the
  // gap between the query on screen and the query loaded -- derived, not a
  // second piece of state that an effect has to keep in step.
  const [loaded, setLoaded] = React.useState<{ query: string; data: unknown } | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const classes = React.useMemo(() => uniq(options.groups.map((g) => [g.classId, g.className] as const)), [options.groups])
  const divisions = React.useMemo(() => uniq(options.groups.map((g) => [g.divisionId, g.divisionName] as const)), [options.groups])
  const programs = React.useMemo(() => uniq(options.groups.map((g) => [g.programId, g.programName] as const)), [options.groups])
  const sections = React.useMemo(
    () =>
      options.groups
        .filter((g) => (!classId || g.classId === classId) && (!divisionId || g.divisionId === divisionId) && (!programId || g.programId === programId))
        .flatMap((g) => g.sections.map((s) => ({ id: s.id, label: `${g.className} · ${g.divisionName} · ${g.programName} · Section ${s.name}` }))),
    [options.groups, classId, divisionId, programId],
  )

  const query = React.useMemo(() => {
    const p = new URLSearchParams()
    if (kind === 'students' || kind === 'missing-documents') {
      if (sessionId) p.set('academicSessionId', sessionId)
      if (classId) p.set('classId', classId)
      if (divisionId) p.set('divisionId', divisionId)
      if (programId) p.set('programId', programId)
      if (sectionId) p.set('sectionId', sectionId)
      if (groupBy !== 'none') p.set('groupBy', groupBy)
      if (kind === 'students' && studentStatus !== 'ACTIVE') p.set('status', studentStatus)
    } else if (kind === 'staff') {
      if (departmentId) p.set('departmentId', departmentId)
      if (designationId) p.set('designationId', designationId)
      if (staffGroupBy !== 'none') p.set('groupBy', staffGroupBy)
    } else {
      if (examId) p.set('examId', examId)
      if (kind === 'results') {
        if (classId) p.set('classId', classId)
        if (programId) p.set('programId', programId)
        if (sectionId) p.set('sectionId', sectionId)
        if (resultGroupBy !== 'none') p.set('groupBy', resultGroupBy)
      }
    }
    return p.toString()
  }, [kind, sessionId, classId, divisionId, programId, sectionId, groupBy, studentStatus, departmentId, designationId, staffGroupBy, examId, resultGroupBy])

  const endpoint = `/api/v1/reports/${kind}`
  const csvHref = `${endpoint}?${query}${query ? '&' : ''}format=csv`
  const needsExam = (kind === 'exams' || kind === 'results') && !examId

  const fullQuery = `${endpoint}${query ? `?${query}` : ''}`
  const data = !needsExam && loaded?.query === fullQuery ? loaded.data : null
  const loading = !needsExam && loaded?.query !== fullQuery && error === null

  React.useEffect(() => {
    if (needsExam || loaded?.query === fullQuery || error !== null) return
    let cancelled = false
    api
      .get<unknown>(fullQuery)
      .then((out) => {
        if (!cancelled) setLoaded({ query: fullQuery, data: out })
      })
      .catch((caught) => {
        if (!cancelled) setError(caught instanceof ApiError ? caught.message : 'The report could not be loaded. Please try again.')
      })
    return () => {
      cancelled = true
    }
  }, [fullQuery, needsExam, loaded, error])

  const [erroredQuery, setErroredQuery] = React.useState<string | null>(null)
  if (error !== null && erroredQuery !== fullQuery) {
    // The query moved on since the error: forget it and let the effect retry.
    if (erroredQuery !== null) setError(null)
    setErroredQuery(fullQuery)
  }

  const scopeSentence = describeScope({
    session: options.sessions.find((s) => s.id === sessionId)?.name ?? null,
    className: classes.find(([id]) => id === classId)?.[1] ?? null,
    divisionName: divisions.find(([id]) => id === divisionId)?.[1] ?? null,
    programName: programs.find(([id]) => id === programId)?.[1] ?? null,
    sectionLabel: sections.find((s) => s.id === sectionId)?.label ?? null,
  })

  return (
    <div className="space-y-4">
      <div className="print-hide flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => setKind(k.key)}
            aria-pressed={kind === k.key}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              kind === k.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-surface text-foreground-muted hover:border-border-strong'
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <Card className="print-hide p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {kind === 'students' || kind === 'missing-documents' ? (
            <>
              <Select aria-label="Academic session" value={sessionId} onChange={(e) => { setSessionId(e.target.value); setSectionId('') }}>
                {options.sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.isCurrent ? ' (current)' : ''}
                  </option>
                ))}
              </Select>
              <Select aria-label="Class" value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId('') }}>
                <option value="">All classes</option>
                {classes.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </Select>
              <Select aria-label="Division" value={divisionId} onChange={(e) => { setDivisionId(e.target.value); setSectionId('') }}>
                <option value="">All divisions</option>
                {divisions.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </Select>
              <Select aria-label="Programme" value={programId} onChange={(e) => { setProgramId(e.target.value); setSectionId('') }}>
                <option value="">All programmes</option>
                {programs.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </Select>
              <Select aria-label="Section" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                <option value="">All sections</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </Select>
              <Select aria-label="Group by" value={groupBy} onChange={(e) => setGroupBy(e.target.value as ReportGrouping)}>
                {REPORT_GROUPINGS.map((g) => (
                  <option key={g} value={g}>{REPORT_GROUPING_LABEL[g]}</option>
                ))}
              </Select>
              {kind === 'students' ? (
                <Select aria-label="Status" value={studentStatus} onChange={(e) => setStudentStatus(e.target.value)}>
                  <option value="ACTIVE">Active students</option>
                  <option value="ALL">All statuses</option>
                  <option value="LEFT">Left</option>
                  <option value="GRADUATED">Graduated</option>
                </Select>
              ) : null}
            </>
          ) : null}

          {kind === 'staff' ? (
            <>
              <Select aria-label="Department" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
                <option value="">All departments</option>
                {options.departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
              <Select aria-label="Designation" value={designationId} onChange={(e) => setDesignationId(e.target.value)}>
                <option value="">All designations</option>
                {options.designations.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
              <Select aria-label="Group by" value={staffGroupBy} onChange={(e) => setStaffGroupBy(e.target.value as typeof staffGroupBy)}>
                <option value="none">No grouping</option>
                <option value="department">By department</option>
                <option value="designation">By designation</option>
                <option value="type">By staff type</option>
              </Select>
            </>
          ) : null}

          {kind === 'exams' || kind === 'results' ? (
            <>
              <Select aria-label="Exam" value={examId} onChange={(e) => setExamId(e.target.value)} className="sm:col-span-2">
                {options.exams.length === 0 ? <option value="">No exams yet</option> : null}
                {options.exams.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} · {x.sessionName}
                  </option>
                ))}
              </Select>
              {kind === 'results' ? (
                <>
                  <Select aria-label="Class" value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId('') }}>
                    <option value="">All classes</option>
                    {classes.map(([id, name]) => (
                      <option key={id} value={id}>{name}</option>
                    ))}
                  </Select>
                  <Select aria-label="Programme" value={programId} onChange={(e) => { setProgramId(e.target.value); setSectionId('') }}>
                    <option value="">All programmes</option>
                    {programs.map(([id, name]) => (
                      <option key={id} value={id}>{name}</option>
                    ))}
                  </Select>
                  <Select aria-label="Section" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                    <option value="">All sections</option>
                    {sections.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </Select>
                  <Select aria-label="Group by" value={resultGroupBy} onChange={(e) => setResultGroupBy(e.target.value as typeof resultGroupBy)}>
                    <option value="none">No grouping</option>
                    <option value="class">By class</option>
                    <option value="program">By programme</option>
                    <option value="section">By section</option>
                  </Select>
                </>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={() => window.print()} disabled={!data || loading}>
            <Printer className="h-4 w-4" aria-hidden />
            Print
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <a href={csvHref} aria-disabled={needsExam || undefined}>
              <Download className="h-4 w-4" aria-hidden />
              Download CSV
            </a>
          </Button>
          <p className="text-xs text-foreground-muted">The file holds exactly the rows shown here, for the same filters.</p>
        </div>
      </Card>

      {error ? <Alert variant="danger" className="print-hide">{error}</Alert> : null}

      <article className="print-area" aria-label="Report">
        <header className="mb-3">
          <p className="text-xs font-semibold tracking-wide text-foreground-muted uppercase">{options.collegeName}</p>
          <h2 className="text-lg font-semibold text-foreground">{KINDS.find((k) => k.key === kind)?.label}</h2>
          <p className="text-sm text-foreground-muted">{scopeSentence}</p>
        </header>

        {needsExam ? (
          <EmptyState title="Choose an exam" description="Exam and result reports are for one exam at a time." />
        ) : loading && !data ? (
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : data ? (
          <ReportBody kind={kind} data={data} />
        ) : null}

        {data && !loading ? (
          <p className="mt-3 text-xs text-foreground-muted">
            Generated {formatDateTime((data as { generatedAt?: string }).generatedAt ?? new Date().toISOString())}. Figures are as stored; a report is not an official document unless signed.
          </p>
        ) : null}
      </article>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function uniq(pairs: readonly (readonly [string, string])[]): [string, string][] {
  const seen = new Map<string, string>()
  for (const [id, name] of pairs) if (!seen.has(id)) seen.set(id, name)
  return [...seen.entries()]
}

function describeScope(s: { session: string | null; className: string | null; divisionName: string | null; programName: string | null; sectionLabel: string | null }): string {
  const parts = [s.sectionLabel ?? [s.className, s.divisionName, s.programName].filter(Boolean).join(' · '), s.session ? `Session ${s.session}` : null].filter(Boolean)
  return parts.length ? parts.join(' — ') : 'The whole school'
}

function ReportBody({ kind, data }: { kind: ReportKind; data: unknown }) {
  switch (kind) {
    case 'students':
      return <GroupedTable report={data as GroupedReport<StudentReportRowOut>} head={['Code', 'Name', "Father's name", 'Class', 'Programme', 'Section', 'Roll', 'Status']} cells={(r) => [r.studentCode, r.fullName, r.fatherName, r.className ?? '—', r.programName ?? '—', r.sectionName ?? '—', r.rollNumber ?? '—', r.status]} empty="No students match these filters." />
    case 'staff':
      return <GroupedTable report={data as GroupedReport<StaffReportRow>} head={['Code', 'Name', 'Designation', 'Department', 'Type', 'Status', 'Assignments']} cells={(r) => [r.staffCode, r.fullName, r.designation, r.department ?? '—', r.staffType, r.employmentStatus, String(r.activeAssignments)]} empty="No staff match these filters." />
    case 'missing-documents':
      return <GroupedTable report={data as GroupedReport<MissingDocumentRow>} head={['Code', 'Name', 'Class', 'Programme', 'Section', 'Missing']} cells={(r) => [r.studentCode, r.fullName, r.className ?? '—', r.programName ?? '—', r.sectionName ?? '—', r.missing.join(', ')]} empty="Nobody in this scope is missing a required document." />
    case 'exams': {
      const out = data as ExamReportOut
      return (
        <div className="space-y-3">
          <p className="text-sm text-foreground-muted">
            {out.exam.name} · {out.exam.examTypeName} · {out.exam.sessionName} — {out.totals.submitted} of {out.totals.papers} mark sheets submitted, {out.totals.open} open, {out.totals.notOpened} not opened.
          </p>
          <Card className="overflow-hidden">
            <TableWrapper>
              <Table>
                <THead>
                  <TR>{['Subject', 'Class', 'Programme', 'Section', 'Teacher', 'Mark sheet', 'Entered / total'].map((h) => <TH key={h}>{h}</TH>)}</TR>
                </THead>
                <TBody>
                  {out.papers.map((p) => (
                    <TR key={`${p.examPaperId}/${p.sectionId}`}>
                      <TD>{p.subjectName}</TD>
                      <TD>{p.className}</TD>
                      <TD>{p.programName ?? 'Whole class'}</TD>
                      <TD>{p.sectionName}</TD>
                      <TD>{p.teacherName ?? '—'}</TD>
                      <TD>{p.status ?? 'Not opened'}</TD>
                      <TD className="tabular-nums">{p.counts.entered} / {p.counts.total}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          </Card>
        </div>
      )
    }
    case 'results': {
      const out = data as ResultReportOut
      return (
        <div className="space-y-3">
          <p className="text-sm text-foreground-muted">
            {out.exam.name} · {out.exam.examTypeName} · {out.exam.sessionName} — {out.summary.total} results: {out.summary.passed} passed, {out.summary.failed} failed, {out.summary.incomplete} incomplete
            {out.summary.passPercentage !== null ? ` · pass rate ${out.summary.passPercentage}%` : ''}.
          </p>
          <GroupedTable report={{ generatedAt: '', scope: emptyScope, groups: out.groups, total: out.total }} head={['Code', 'Name', 'Section', 'Obtained', 'Total', '%', 'Grade', 'Result', 'Position', 'Status']} cells={(r) => [r.studentCode, r.studentName, r.sectionName, r.totalObtainedMarks, r.totalMaxMarks, r.percentage ?? '—', r.grade ?? '—', r.outcome, r.position === null ? '—' : String(r.position), r.status]} empty="No results match these filters." />
        </div>
      )
    }
  }
}

const emptyScope = { sessionName: null, className: null, divisionName: null, programName: null, groupLabel: null, sectionName: null }

function GroupedTable<Row>({ report, head, cells, empty }: { report: GroupedReport<Row>; head: string[]; cells: (row: Row) => string[]; empty: string }) {
  if (report.total === 0) return <EmptyState title={empty} />
  return (
    <div className="space-y-4">
      {report.groups.map((g) => (
        <section key={g.key || 'all'} className="print-keep-together">
          {g.label !== 'All' ? (
            <h3 className="mb-1 text-sm font-semibold text-foreground">
              {g.label} <span className="font-normal text-foreground-muted">· {g.count}</span>
            </h3>
          ) : null}
          <Card className="overflow-hidden">
            <TableWrapper>
              <Table>
                <THead>
                  <TR>{head.map((h) => <TH key={h}>{h}</TH>)}</TR>
                </THead>
                <TBody>
                  {g.rows.map((row, i) => (
                    <TR key={i}>
                      {cells(row).map((c, j) => (
                        <TD key={j} className={j >= 3 ? 'tabular-nums' : undefined}>{c}</TD>
                      ))}
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrapper>
          </Card>
        </section>
      ))}
      <p className="text-sm text-foreground-muted">{report.total} in total.</p>
    </div>
  )
}
