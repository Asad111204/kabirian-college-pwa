import Link from 'next/link'
import { Banknote, Receipt, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatTile } from './stat-tiles'
import { MoneyChart } from '@/features/finance/money-chart'
import { formatPaisa } from '@/lib/money'
import type { FinanceSummary } from '@/server/services/finance.service'

/**
 * The college's money, on the dashboard.
 *
 * The same summary the Finance page reads, so the two screens can never
 * disagree about a figure. What is still owed is emphasised when there is
 * anything owing, because that is the number the office acts on.
 */
export function FinanceTiles({ finance }: { finance: FinanceSummary | null }) {
  if (!finance) return null

  return (
    <section className="mb-5" aria-label="Payments">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">Payments · {finance.monthLabel}</h2>
        <span className="flex gap-3 text-sm">
          <Link href="/admin/fees" className="text-primary hover:underline">
            Fee vouchers
          </Link>
          <Link href="/admin/finance" className="text-primary hover:underline">
            Finance
          </Link>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile
          label="Fees collected"
          value={formatPaisa(finance.collectedPaisa)}
          icon={Banknote}
          href="/admin/fees"
          hint="This month, payments received"
        />
        <StatTile
          label="Still owed"
          value={formatPaisa(finance.outstandingPaisa)}
          icon={Receipt}
          href="/admin/fees?overdueOnly=true"
          hint={finance.overdueVouchers > 0 ? `${finance.overdueVouchers} voucher${finance.overdueVouchers === 1 ? '' : 's'} overdue` : 'Nothing overdue'}
          emphasis={finance.outstandingPaisa > 0}
        />
        <StatTile label="Billed" value={formatPaisa(finance.billedPaisa)} icon={Wallet} href="/admin/fees" hint="This month's vouchers" />
        <StatTile label="Spent" value={formatPaisa(finance.spentPaisa)} icon={TrendingDown} href="/admin/finance" hint="This month's expenses" />
        <StatTile
          label="Left over"
          value={formatPaisa(finance.netPaisa)}
          icon={TrendingUp}
          href="/admin/finance"
          hint="Collected less spent"
          emphasis={finance.netPaisa < 0}
        />
      </div>

      <Card className="mt-3">
        <CardHeader>
          <div className="min-w-0">
            <CardTitle>The year, month by month</CardTitle>
            <p className="mt-0.5 text-sm text-foreground-muted">Fees collected against money spent.</p>
          </div>
        </CardHeader>
        <CardContent>
          <MoneyChart history={finance.history} />
        </CardContent>
      </Card>

      {finance.byCategory.length > 0 ? (
        <Card className="mt-3">
          <CardHeader>
            <CardTitle>Where {finance.monthLabel} went</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {finance.byCategory.slice(0, 5).map((row) => {
                const share = finance.spentPaisa > 0 ? Math.round((row.amountPaisa / finance.spentPaisa) * 100) : 0
                return (
                  <li key={row.category}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="text-foreground">{row.label}</span>
                      <span className="tabular-nums text-foreground-muted">
                        {formatPaisa(row.amountPaisa)} · {share}%
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-muted">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                    </div>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </section>
  )
}
