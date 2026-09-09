'use client'

import * as React from 'react'
import { Field, Input } from '@/components/ui/field'
import { formatPaisa, rupeesToPaisa } from '@/lib/money'
import { FEE_HEADS, FEE_HEAD_LABEL, type FeeHeadValue } from '@/server/fees/fees-policy'

/** One row of the editor: a head, what the office typed, and its own words for "Others". */
export interface FeeLineDraft {
  head: FeeHeadValue
  amount: string
  label: string
}

/** A blank set: every head the college charges, all empty, all optional. */
export function emptyFeeLines(): FeeLineDraft[] {
  return FEE_HEADS.map((head) => ({ head, amount: '', label: '' }))
}

/** What the drafts come to in paisa, ignoring the ones left blank. */
export function feeLinesTotal(lines: readonly FeeLineDraft[]): number {
  return lines.reduce((sum, line) => sum + (line.amount.trim() === '' ? 0 : (rupeesToPaisa(line.amount) ?? 0)), 0)
}

/** The drafts as the API wants them: only the heads that were filled in. */
export function feeLinesPayload(lines: readonly FeeLineDraft[]) {
  return lines
    .filter((line) => line.amount.trim() !== '')
    .map((line) => ({ head: line.head, amountPaisa: line.amount, ...(line.head === 'OTHER' && line.label.trim() !== '' ? { label: line.label.trim() } : {}) }))
}

/**
 * The college's fee heads, with a box for each.
 *
 * Every head is optional: the office fills in the ones that apply to this
 * student and leaves the rest empty. The whole year's amount goes in each
 * box — the college charges by the year, and a family pays it in instalments.
 */
export function FeeLinesEditor({
  lines,
  onChange,
  disabled = false,
  discount,
  onDiscountChange,
}: {
  lines: FeeLineDraft[]
  onChange: (lines: FeeLineDraft[]) => void
  disabled?: boolean
  discount: string
  onDiscountChange: (value: string) => void
}) {
  const total = feeLinesTotal(lines)
  const discountPaisa = discount.trim() === '' ? 0 : (rupeesToPaisa(discount) ?? 0)
  const payable = Math.max(0, total - Math.min(discountPaisa, total))

  const set = (index: number, patch: Partial<FeeLineDraft>) => {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)))
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground-muted">
        The whole year&apos;s amount for each. Leave a box empty if it does not apply — every one of them is optional.
      </p>

      <ul className="space-y-2">
        {lines.map((line, index) => (
          <li key={line.head} className="flex flex-wrap items-end gap-3">
            <Field label={FEE_HEAD_LABEL[line.head]} htmlFor={`fee-${line.head}`} className="min-w-[10rem] flex-1">
              <Input
                id={`fee-${line.head}`}
                inputMode="decimal"
                value={line.amount}
                onChange={(e) => set(index, { amount: e.target.value })}
                disabled={disabled}
                placeholder="0"
              />
            </Field>
            {line.head === 'OTHER' ? (
              <Field label="What is it for?" htmlFor="fee-other-label" className="min-w-[12rem] flex-1">
                <Input
                  id="fee-other-label"
                  value={line.label}
                  onChange={(e) => set(index, { label: e.target.value })}
                  disabled={disabled}
                  maxLength={80}
                  placeholder="Hostel, transport…"
                />
              </Field>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-end gap-3 border-t border-border pt-3">
        <Field label="Concession (Rs)" htmlFor="fee-discount" hint="Taken off the year's total. Never more than the fee itself.">
          <Input id="fee-discount" inputMode="decimal" value={discount} onChange={(e) => onDiscountChange(e.target.value)} disabled={disabled} className="max-w-[10rem]" />
        </Field>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 pb-2 text-sm">
          <div>
            <dt className="text-xs text-foreground-muted">Year&apos;s fee</dt>
            <dd className="font-semibold tabular-nums">{formatPaisa(total)}</dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Payable</dt>
            <dd className="font-semibold tabular-nums text-foreground">{formatPaisa(payable)}</dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
