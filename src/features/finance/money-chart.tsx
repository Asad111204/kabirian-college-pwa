'use client'

import * as React from 'react'
import { formatPaisa } from '@/lib/money'
import { barFraction, chartCeiling, type MonthMoney } from '@/server/finance/finance-policy'

/**
 * Money in and money out, month by month, drawn by hand.
 *
 * No charting library: the college's deployment carries no paid dependencies
 * and a bar chart is a handful of rectangles. It is drawn in SVG user units
 * and scaled by the viewBox, so it is sharp at any size and readable on a
 * phone, and every bar carries a `<title>` so a screen reader and a hover
 * both give the real figures rather than a picture.
 */
const WIDTH = 720
const HEIGHT = 260
const PAD = { top: 16, right: 12, bottom: 34, left: 12 }

export function MoneyChart({ history }: { history: MonthMoney[] }) {
  const ceiling = chartCeiling(history.flatMap((m) => [m.collectedPaisa, m.spentPaisa]))
  const plotHeight = HEIGHT - PAD.top - PAD.bottom
  const plotWidth = WIDTH - PAD.left - PAD.right
  const slot = history.length > 0 ? plotWidth / history.length : plotWidth
  const barWidth = Math.max(4, Math.min(18, slot / 3))

  const everything = history.every((m) => m.collectedPaisa === 0 && m.spentPaisa === 0)

  return (
    <figure className="m-0">
      <figcaption className="mb-2 flex flex-wrap items-center gap-4 text-xs text-foreground-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-success-600" aria-hidden />
          Fees collected
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-danger-600" aria-hidden />
          Spent
        </span>
        <span className="ml-auto">Top of the scale: {formatPaisa(ceiling)}</span>
      </figcaption>

      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="h-56 w-full min-w-[32rem]"
          role="img"
          aria-label={`Fees collected and money spent for each of the last ${history.length} months.`}
        >
          {/* Three guide lines, so a bar can be read against something. */}
          {[0, 0.5, 1].map((fraction) => {
            const y = PAD.top + plotHeight * (1 - fraction)
            return <line key={fraction} x1={PAD.left} y1={y} x2={WIDTH - PAD.right} y2={y} className="stroke-border" strokeWidth={1} />
          })}

          {history.map((month, index) => {
            const centre = PAD.left + slot * index + slot / 2
            const collectedHeight = plotHeight * barFraction(month.collectedPaisa, ceiling)
            const spentHeight = plotHeight * barFraction(month.spentPaisa, ceiling)
            return (
              <g key={month.month}>
                <rect
                  x={centre - barWidth - 1}
                  y={PAD.top + plotHeight - collectedHeight}
                  width={barWidth}
                  height={collectedHeight}
                  rx={2}
                  className="fill-success-600"
                >
                  <title>{`${month.label}: ${formatPaisa(month.collectedPaisa)} collected`}</title>
                </rect>
                <rect
                  x={centre + 1}
                  y={PAD.top + plotHeight - spentHeight}
                  width={barWidth}
                  height={spentHeight}
                  rx={2}
                  className="fill-danger-600"
                >
                  <title>{`${month.label}: ${formatPaisa(month.spentPaisa)} spent`}</title>
                </rect>
                <text x={centre} y={HEIGHT - 12} textAnchor="middle" className="fill-[var(--foreground-muted)] text-[11px]">
                  {month.label}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {everything ? <p className="mt-2 text-sm text-foreground-muted">Nothing has been collected or spent in these months yet.</p> : null}

      {/* The same figures in words, for anybody the picture does not serve. */}
      <details className="mt-3">
        <summary className="cursor-pointer text-sm text-foreground-muted">Show these figures as a table</summary>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-foreground-muted">
              <th className="py-1 font-medium">Month</th>
              <th className="py-1 text-right font-medium">Collected</th>
              <th className="py-1 text-right font-medium">Spent</th>
            </tr>
          </thead>
          <tbody>
            {history.map((month) => (
              <tr key={month.month} className="border-t border-border">
                <td className="py-1">{month.label}</td>
                <td className="py-1 text-right tabular-nums">{formatPaisa(month.collectedPaisa)}</td>
                <td className="py-1 text-right tabular-nums">{formatPaisa(month.spentPaisa)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  )
}
