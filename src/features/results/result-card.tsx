import * as React from 'react'
import type { ResultDetail } from '@/server/services/results.service'
import { marksLabel, percentageLabel, positionLabel } from './shared'

/**
 * The official result card.
 *
 * Presentational only — it renders the **stored published snapshot** and
 * calculates nothing. Subject names, maximums, marks, percentages, grades, the
 * totals, the outcome and the position all come from the row as it was written
 * when the result was generated, so renaming a subject or editing the grading
 * scale afterwards cannot change what a printed card says (ADR-137).
 *
 * No `'use client'`: it has no state and no handlers, so it renders on the
 * server and ships no JavaScript. That also makes it reusable as-is — a future
 * admin or staff print action can render this same component without copying
 * the design.
 *
 * The look is an academic document, not a dashboard: white paper, thin rules,
 * one colour taken from the college's own logo, and nothing rounded, tinted or
 * shadowed. On paper, `.print-area` in globals.css hides everything else and
 * this fills an A4 portrait page.
 */

/** The college's own strapline, as it appears on the official logo. */
const TAGLINE = 'INSPIRING MINDS SHAPING FUTURE'

/**
 * The official logo, used exactly as the college supplied it.
 *
 * The file is a 1280x960 canvas carrying a wide horizontal lockup: the artwork
 * itself measures 572x155, sitting dead centre with roughly 27% blank canvas to
 * each side and 42% above and below. Rendering the whole canvas large enough
 * for the crest to read would have cost about 110mm of page height for 18mm of
 * ink, so the image is shown at full width inside a 6:1 box and centred with
 * `object-cover`.
 *
 * That paints the artwork at ~66mm wide on A4 while the blank canvas margin is
 * simply not painted. The file is untouched, the aspect ratio is preserved by
 * `object-cover`, and the artwork is never clipped: the visible band is the
 * middle 22.2% of the image (38.9%-61.1%) and the artwork occupies 41.9%-57.9%,
 * leaving clear space on both sides.
 */
const LOGO_SRC = '/brand/college-logo.jpeg'

/** Labels are small, spaced capitals; values are plain text. */
const LABEL = 'text-[9px] font-semibold uppercase tracking-[0.09em] text-ink-500'

/** One label/value pair in the student information grid. */
function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-ink-200 px-3 py-1.5 last:border-b-0">
      <dt className={`w-24 shrink-0 ${LABEL}`}>{label}</dt>
      {/* Never truncated: a printed card that hides half a name is worse than
          one that wraps. */}
      <dd className="min-w-0 flex-1 text-[13px] font-medium break-words text-ink-900">{value}</dd>
    </div>
  )
}

/** One field in the compact examination row above the student grid. */
function ExamField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className={LABEL}>{label}</p>
      <p className="mt-0.5 text-[13px] font-medium break-words text-ink-900">{value}</p>
    </div>
  )
}

/** How a paper went, as a word — never a colour alone, never a bare zero. */
function statusWord(subject: ResultDetail['subjects'][number]): string {
  if (subject.status === 'ABSENT') return 'Absent'
  if (subject.outcome === 'PENDING') return 'Not marked'
  return subject.outcome === 'PASS' ? 'Pass' : 'Fail'
}

/** An absent student scored 0.00; an unmarked paper has no mark at all. */
function obtainedLabel(subject: ResultDetail['subjects'][number]): string {
  return subject.status === 'PENDING' ? '—' : (subject.obtainedMarks ?? '—')
}

export function ResultCard({
  result,
  collegeName,
}: {
  result: ResultDetail
  collegeName: string
}) {
  const incomplete = result.outcome === 'INCOMPLETE'

  // Every figure is read from the snapshot. An incomplete result has no
  // percentage, grade or position stored, and the helpers render a dash for
  // each rather than inventing a zero.
  const figures: { label: string; value: string; strong?: boolean }[] = [
    { label: 'Total Marks', value: marksLabel(result.totalMaxMarks) },
    { label: 'Obtained', value: marksLabel(result.totalObtainedMarks) },
    { label: 'Percentage', value: percentageLabel(result.percentage) },
    { label: 'Grade', value: result.grade ?? '—' },
    { label: 'Result', value: result.outcome, strong: true },
    { label: 'Position', value: positionLabel(result.position) },
  ]

  return (
    <article
      // `print-area` is what the print stylesheet reveals; everything else on
      // the page is hidden when this is printed.
      className="print-area mx-auto w-full max-w-[210mm] border border-ink-200 bg-white px-5 py-6 text-ink-900 sm:px-10 sm:py-9"
      aria-label="Official result card"
    >
      {/* ------------------------------- header ------------------------------ */}
      <header className="print-keep-together text-center">
        {/* A plain <img>, deliberately. next/image lazy-loads and wraps the
            element, and a logo that has not loaded when the reader presses
            Print is a result card with a blank space where the crest should be.
            The file is 25 KB and served once.

            The size is fixed in millimetres with no breakpoint, so the printed
            logo is the same 66mm whether the browser applies screen breakpoints
            to the page box or not. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={LOGO_SRC}
          alt={`${collegeName} logo`}
          width={1280}
          height={960}
          loading="eager"
          decoding="sync"
          className="mx-auto block aspect-[6/1] w-full max-w-[148mm] object-cover object-center"
        />

        <h1 className="mt-4 text-[22px] leading-tight font-bold tracking-[0.11em] text-college uppercase">
          {collegeName}
        </h1>
        <p className="mt-1.5 text-[9.5px] font-medium tracking-[0.26em] text-ink-500 uppercase">
          {TAGLINE}
        </p>

        <div className="mt-4 border-t border-ink-200" />

        <p className="mt-3 text-[13px] font-semibold tracking-[0.34em] text-ink-800 uppercase">
          Result Card
        </p>
      </header>

      <div className="mt-3 border-b-2 border-college" />

      {/* --------------------------- examination ---------------------------- */}
      <dl className="print-keep-together mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        <ExamField label="Examination" value={result.examName} />
        <ExamField label="Exam Type" value={result.examTypeName} />
        <ExamField label="Academic Session" value={result.sessionName} />
      </dl>

      {/* ------------------------ student information ------------------------ */}
      <div className="print-keep-together mt-4 grid grid-cols-1 border border-ink-300 sm:grid-cols-2">
        <dl className="sm:border-r sm:border-ink-200">
          <InfoRow label="Student Name" value={result.studentName} />
          <InfoRow label="Student Code" value={result.studentCode} />
          <InfoRow label="Roll Number" value={result.rollNumber ?? '—'} />
        </dl>
        <dl className="border-t border-ink-200 sm:border-t-0">
          <InfoRow label="Class" value={result.className} />
          <InfoRow label="Division" value={result.divisionName} />
          <InfoRow label="Programme" value={result.programName} />
          <InfoRow label="Section" value={result.sectionName} />
        </dl>
      </div>

      {/* ----------------------------- subjects ------------------------------ */}
      <section className="mt-5">
        <h2 className={`mb-2 ${LABEL}`}>Subject-wise marks</h2>

        {/* Phones get a readable stack; A4 print width is far past `sm`, so the
            table below is what actually reaches the paper. */}
        <ul className="divide-y divide-ink-200 border-y border-ink-300 sm:hidden">
          {result.subjects.map((subject) => (
            <li key={subject.examPaperId} className="px-1 py-2">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[13px] font-medium">{subject.subjectName}</p>
                <p className="shrink-0 text-[12px] font-semibold">{statusWord(subject)}</p>
              </div>
              <p className="mt-0.5 text-[12px] tabular-nums text-ink-600">
                {obtainedLabel(subject)} / {subject.maxMarks} ·{' '}
                {percentageLabel(subject.percentage)} · {subject.grade ?? '—'}
              </p>
            </li>
          ))}
        </ul>

        <div className="scroll-x hidden sm:block">
          <table className="w-full min-w-[30rem] border-collapse border border-ink-300 text-[12.5px]">
            <thead>
              <tr className="bg-ink-50">
                <th className={`border-b border-ink-300 px-2.5 py-1.5 text-left ${LABEL}`}>
                  Subject
                </th>
                <th className={`border-b border-ink-300 px-2.5 py-1.5 text-right ${LABEL}`}>
                  Max Marks
                </th>
                <th className={`border-b border-ink-300 px-2.5 py-1.5 text-right ${LABEL}`}>
                  Obtained
                </th>
                <th className={`border-b border-ink-300 px-2.5 py-1.5 text-right ${LABEL}`}>%</th>
                <th className={`border-b border-ink-300 px-2.5 py-1.5 text-center ${LABEL}`}>
                  Grade
                </th>
                <th className={`border-b border-ink-300 px-2.5 py-1.5 text-center ${LABEL}`}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {result.subjects.map((subject) => (
                <tr key={subject.examPaperId} className="border-b border-ink-200 last:border-b-0">
                  <td className="px-2.5 py-[5px] font-medium">{subject.subjectName}</td>
                  <td className="px-2.5 py-[5px] text-right tabular-nums">{subject.maxMarks}</td>
                  <td className="px-2.5 py-[5px] text-right tabular-nums">
                    {obtainedLabel(subject)}
                  </td>
                  <td className="px-2.5 py-[5px] text-right tabular-nums">
                    {percentageLabel(subject.percentage)}
                  </td>
                  <td className="px-2.5 py-[5px] text-center font-semibold">
                    {subject.grade ?? '—'}
                  </td>
                  <td className="px-2.5 py-[5px] text-center">{statusWord(subject)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* -------------------------- overall result --------------------------- */}
      <section className="print-keep-together mt-5">
        <h2 className={`mb-2 ${LABEL}`}>Overall result</h2>
        {/* Each cell draws its own right and bottom rule and the box draws the
            other two, so the grid closes cleanly whether it lays out two across
            on a phone or three across on paper. */}
        <div className="grid grid-cols-2 border-t border-l border-ink-300 sm:grid-cols-3">
          {figures.map((figure) => (
            <div
              key={figure.label}
              className="border-r border-b border-ink-300 px-3 py-2.5 text-center"
            >
              <p className={LABEL}>{figure.label}</p>
              <p
                className={
                  figure.strong
                    ? 'mt-1 text-lg leading-tight font-bold tracking-[0.05em] text-college uppercase sm:text-xl'
                    : 'mt-1 text-[15px] leading-tight font-semibold tabular-nums text-ink-900'
                }
              >
                {figure.value}
              </p>
            </div>
          ))}
        </div>

        {incomplete ? (
          <div className="mt-2 text-center">
            <p className="text-[11px] font-semibold tracking-[0.08em] text-ink-900 uppercase">
              Result incomplete
            </p>
            <p className="mt-0.5 text-[11px] text-ink-600">
              Your final result is not yet complete.
            </p>
          </div>
        ) : null}
      </section>

      {/* ----------------------------- signatures ---------------------------- */}
      <div className="print-keep-together mt-7 grid grid-cols-3 gap-6 sm:gap-10">
        {['Class Teacher / Subject Teacher', 'Examination Incharge', 'Principal'].map((role) => (
          <div key={role} className="text-center">
            {/* Room for an actual signature above the rule. */}
            <div className="h-10" />
            <div className="border-t border-ink-400" />
            <p className={`mt-1.5 ${LABEL}`}>{role}</p>
          </div>
        ))}
      </div>

      <p className="mt-6 text-center text-[9px] text-ink-400">
        This result card is generated from the officially published examination result.
      </p>
    </article>
  )
}
