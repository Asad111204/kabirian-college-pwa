'use client'

import * as React from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format'
import { formatPaisa } from '@/lib/money'
import { FEE_VOUCHER_STATUS_LABEL } from '@/server/fees/fees-policy'
import type { FeeVoucherDetail } from '@/server/services/fees.service'

/**
 * The fee voucher as a document, for the counter and for the bank.
 *
 * Saved as a PDF the way the result card is: the browser's own print dialogue,
 * with "Save as PDF" as the destination. That keeps the college free of a PDF
 * library and a headless browser — neither of which this deployment carries —
 * and gives a file that opens anywhere.
 *
 * Three identical parts on one A4 sheet, which is how a fee voucher is used in
 * Pakistan: one for the bank, one for the college, one for the family. Each
 * carries the same figures, and each is signed separately.
 *
 * The college asked that a voucher show **what has been paid and what is
 * left**, not the year's total. A family pays in instalments, so "remaining"
 * is the only figure they need at the counter, and printing the whole year's
 * fee beside it invites paying the wrong number.
 */
export function VoucherPrint({ voucher, collegeName }: { voucher: FeeVoucherDetail; collegeName: string }) {
  return (
    <>
      <div className="print-hide mb-4 flex justify-end">
        <Button type="button" variant="secondary" onClick={() => window.print()}>
          <Printer className="h-4 w-4" aria-hidden />
          Print or save as PDF
        </Button>
      </div>

      <div className="print-area rounded-[var(--radius-card)] border border-border bg-white p-4 text-black">
        <div className="grid gap-3 sm:grid-cols-3">
          {(['Bank copy', 'School copy', 'Student copy'] as const).map((copy) => (
            <VoucherCopy key={copy} copy={copy} voucher={voucher} collegeName={collegeName} />
          ))}
        </div>
      </div>
    </>
  )
}

function Line({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-dotted border-black/25 py-[3px] text-[11px] last:border-0">
      <span className="text-black/70">{label}</span>
      <span className={strong ? 'font-semibold tabular-nums' : 'tabular-nums'}>{value}</span>
    </div>
  )
}

function VoucherCopy({ copy, voucher, collegeName }: { copy: string; voucher: FeeVoucherDetail; collegeName: string }) {
  return (
    <section className="break-inside-avoid border border-black/60 p-3">
      <header className="border-b border-black/60 pb-2 text-center">
        <h2 className="text-[13px] font-bold uppercase leading-tight tracking-wide">{collegeName}</h2>
        <p className="text-[10px] uppercase tracking-wider text-black/70">Fee voucher</p>
        <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider">{copy}</p>
      </header>

      <div className="mt-2">
        <Line label="Voucher no." value={voucher.voucherNumber} strong />
        <Line label="Session" value={voucher.academicSessionName} />
        {voucher.dueDate ? <Line label="Due date" value={formatDate(voucher.dueDate)} strong /> : null}
      </div>

      <div className="mt-2 border-t border-black/25 pt-2">
        <Line label="Student" value={voucher.studentName} />
        <Line label="Student ID" value={voucher.studentCode} />
        {voucher.sectionLabel ? <Line label="Class" value={voucher.sectionLabel} /> : null}
      </div>

      {/* What the family needs at the counter: what they have paid, and what
          is left. The year's total is deliberately not printed. */}
      <div className="mt-2 border-t border-black/25 pt-2">
        <Line label="Paid so far" value={formatPaisa(voucher.paidPaisa)} />
        {voucher.lateFinePaisa > 0 ? <Line label="Late fine" value={`+ ${formatPaisa(voucher.lateFinePaisa)}`} /> : null}
      </div>

      <div className="mt-2 flex items-baseline justify-between border-y-2 border-black/70 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide">Remaining</span>
        <span className="text-[15px] font-bold tabular-nums">{formatPaisa(voucher.outstandingPaisa)}</span>
      </div>

      <p className="mt-1 text-center text-[10px] text-black/70">
        {voucher.status === 'PAID' ? 'PAID IN FULL' : `Status: ${FEE_VOUCHER_STATUS_LABEL[voucher.status]}`}
      </p>

      <p className="mt-2 text-[9px] leading-snug text-black/70">
        The fee may be paid in instalments. Please quote the voucher number when paying, and keep this copy as your receipt.
      </p>

      <div className="mt-5 flex items-end justify-between gap-3 text-[9px]">
        <span className="w-[45%] border-t border-black/60 pt-0.5 text-center text-black/70">Depositor</span>
        <span className="w-[45%] border-t border-black/60 pt-0.5 text-center text-black/70">Received by</span>
      </div>
    </section>
  )
}
