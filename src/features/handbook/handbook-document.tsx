'use client'

import * as React from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Alert } from '@/components/ui/feedback'
import { LogoFull, Logo } from '@/components/layout/logo'
import { formatDate } from '@/lib/format'
import { HANDBOOK_PARTS, HANDBOOK_SUBTITLE, type HandbookPart } from './handbook-content'

/**
 * The college handbook, as a document.
 *
 * Saved as a PDF the way the result card and the fee voucher are: the
 * browser's own print dialogue, with "Save as PDF" as the destination. No PDF
 * library and no headless browser — neither of which this deployment carries
 * — and the file opens anywhere.
 *
 * It is laid out as paper rather than as a screen: a cover, a contents page,
 * and one part per page, each carrying the college's mark so a loose sheet is
 * still identifiable.
 */
export function HandbookDocument({ collegeName, sessionName }: { collegeName: string; sessionName: string | null }) {
  const today = new Date().toISOString().slice(0, 10)

  return (
    <>
      <div className="print-hide mb-4">
        <Alert variant="info" className="mb-3" title="Saving this as a PDF">
          Press the button, then choose <strong>Save as PDF</strong> as the destination instead of a printer. Keep the paper size at A4 and leave
          background graphics on, so the school&apos;s logo and the panels come out.
        </Alert>
        <div className="flex justify-end">
          <Button type="button" onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden />
            Print or save as PDF
          </Button>
        </div>
      </div>

      <div className="print-area bg-white text-black">
        <Cover collegeName={collegeName} sessionName={sessionName} today={today} />
        <Contents />
        {HANDBOOK_PARTS.map((part, index) => (
          <Part key={part.title} part={part} number={index + 1} collegeName={collegeName} />
        ))}
        <Closing collegeName={collegeName} today={today} />
      </div>
    </>
  )
}

/* -------------------------------------------------------------------------- */

function Cover({ collegeName, sessionName, today }: { collegeName: string; sessionName: string | null; today: string }) {
  return (
    <section className="handbook-page flex flex-col items-center justify-center border border-black/15 px-10 py-16 text-center">
      <LogoFull height={160} />

      {/* The page already has its own heading in the shell; the cover's title
          is the document's, so it is styled rather than nested as a second
          top-level heading. */}
      <p className="mt-10 text-[30px] font-bold leading-tight tracking-tight">{collegeName}</p>
      <p className="mt-1 text-[15px] font-medium uppercase tracking-[0.2em] text-black/60">Management System</p>

      <div className="my-8 h-px w-24 bg-black/25" />

      <p className="text-[22px] font-semibold">Handbook</p>
      <p className="mx-auto mt-3 max-w-md text-[13px] leading-relaxed text-black/70">{HANDBOOK_SUBTITLE}</p>

      <dl className="mt-12 grid grid-cols-2 gap-x-10 gap-y-2 text-[11px]">
        <dt className="text-right text-black/55">Academic session</dt>
        <dd className="text-left font-medium">{sessionName ?? 'Not set'}</dd>
        <dt className="text-right text-black/55">Prepared</dt>
        <dd className="text-left font-medium">{formatDate(today)}</dd>
        <dt className="text-right text-black/55">Covers</dt>
        <dd className="text-left font-medium">{HANDBOOK_PARTS.length} parts</dd>
      </dl>
    </section>
  )
}

function Contents() {
  return (
    <section className="handbook-page border border-black/15 px-10 py-10">
      <PageHead title="Contents" />
      <ol className="mt-6 space-y-2.5">
        {HANDBOOK_PARTS.map((part, index) => (
          <li key={part.title} className="flex items-baseline gap-3 text-[12px]">
            <span className="w-6 shrink-0 text-right font-semibold tabular-nums text-black/45">{index + 1}</span>
            <span className="min-w-0">
              <span className="font-medium">{part.title}</span>
              <span className="block text-[11px] leading-snug text-black/60">{part.summary}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Part({ part, number, collegeName }: { part: HandbookPart; number: number; collegeName: string }) {
  return (
    <section className="handbook-page border border-black/15 px-10 py-10">
      <PageHead title={collegeName} />

      <header className="mt-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black/45">Part {number}</p>
        <h2 className="mt-1 text-[20px] font-bold leading-tight">{part.title}</h2>
        <p className="mt-1 text-[12px] italic text-black/65">{part.summary}</p>
        {part.where ? (
          <p className="mt-2 inline-block border border-black/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-black/70">
            Where: {part.where}
          </p>
        ) : null}
      </header>

      <div className="mt-4 space-y-2.5">
        {part.paragraphs.map((paragraph) => (
          <p key={paragraph.slice(0, 40)} className="text-[12px] leading-relaxed">
            {paragraph}
          </p>
        ))}
      </div>

      {part.steps ? (
        <div className="print-keep-together mt-5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-black/60">Step by step</h3>
          <ol className="mt-2 space-y-1.5">
            {part.steps.map((step, index) => (
              <li key={step} className="flex gap-2.5 text-[12px] leading-snug">
                <span className="mt-[1px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-black/40 text-[9px] font-semibold tabular-nums">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {part.rules ? (
        <div className="print-keep-together mt-5 border-t border-black/20 pt-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-black/60">Rules the system keeps</h3>
          <ul className="mt-2 space-y-2.5">
            {part.rules.map((rule) => (
              <li key={rule.rule} className="border-l-2 border-black/30 pl-3">
                <p className="text-[12px] font-medium leading-snug">{rule.rule}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-black/65">{rule.because}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  )
}

function Closing({ collegeName, today }: { collegeName: string; today: string }) {
  return (
    <section className="handbook-page flex flex-col items-center justify-center border border-black/15 px-10 py-16 text-center">
      <LogoFull height={112} />
      <p className="mt-8 max-w-md text-[12px] leading-relaxed text-black/70">
        This handbook describes {collegeName}&apos;s management system as it stood on {formatDate(today)}. It is generated from the system itself, so
        reprinting it after a change gives an accurate copy.
      </p>
      <p className="mt-6 text-[11px] text-black/50">Anything not covered here is in the audit log, which records who did what and when.</p>
    </section>
  )
}

function PageHead({ title }: { title: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-black/20 pb-2">
      <span className="flex items-center gap-2">
        <Logo size={18} />
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/60">{title}</span>
      </span>
      <span className="text-[10px] uppercase tracking-[0.16em] text-black/40">Handbook</span>
    </div>
  )
}
