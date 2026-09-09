'use client'

import * as React from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Alert, EmptyState } from '@/components/ui/feedback'
import { Receipt } from 'lucide-react'
import { formatDate } from '@/lib/format'
import { formatPaisa } from '@/lib/money'
import { FEE_VOUCHER_STATUS_LABEL, FEE_VOUCHER_STATUS_TONE } from '@/server/fees/fees-policy'
import type { FeeVoucherRow } from '@/server/services/fees.service'
import type { PaginatedResult } from '@/server/services/service-utils'

/**
 * Student → My Fees. Their own vouchers, newest first, and what is still
 * owed across all of them.
 *
 * Read-only by design: money is received at the office counter, and a screen
 * that let a student mark their own fee paid would be worse than no screen.
 */
export function MyFeesScreen({ page }: { page: PaginatedResult<FeeVoucherRow> & { totalOutstandingPaisa: number } }) {
  return (
    <>
      <Card className="mb-4 p-4">
        <dl className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <div>
            <dt className="text-xs text-foreground-muted">Still to pay</dt>
            <dd className={page.totalOutstandingPaisa > 0 ? 'text-lg font-semibold tabular-nums text-danger-600' : 'text-lg font-semibold tabular-nums text-success-700'}>
              {formatPaisa(page.totalOutstandingPaisa)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-foreground-muted">Vouchers</dt>
            <dd className="text-lg font-semibold tabular-nums">{page.total}</dd>
          </div>
        </dl>
      </Card>

      {page.items.length === 0 ? (
        <Card>
          <EmptyState icon={Receipt} title="No fee vouchers yet" description="When the office issues your monthly voucher it will appear here." />
        </Card>
      ) : (
        <ul className="space-y-3">
          {page.items.map((row) => (
            <li key={row.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/student/fees/${row.id}`} className="font-medium text-foreground hover:underline">
                      {row.academicSessionName}
                    </Link>
                    <p className="mt-0.5 text-xs text-foreground-muted">
                      {row.voucherNumber}
                      {row.dueDate ? ` · due ${formatDate(row.dueDate)}` : ' · pay in instalments'}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="text-right">
                      {row.outstandingPaisa > 0 ? (
                        <>
                          <p className="font-semibold tabular-nums text-foreground">{formatPaisa(row.outstandingPaisa)}</p>
                          <p className="text-xs text-foreground-muted">still to pay · {formatPaisa(row.paidPaisa)} paid</p>
                        </>
                      ) : (
                        <>
                          <p className="font-semibold tabular-nums text-success-700">Settled</p>
                          <p className="text-xs text-foreground-muted">{formatPaisa(row.paidPaisa)} paid</p>
                        </>
                      )}
                    </div>
                    {row.overdue ? <Badge variant="danger">Overdue</Badge> : null}
                    <Badge variant={FEE_VOUCHER_STATUS_TONE[row.status]}>{FEE_VOUCHER_STATUS_LABEL[row.status]}</Badge>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <Alert variant="info" className="mt-4">
        Fees are paid at the college office. What you see here is the college&apos;s own record; if something looks wrong, write to the office from{' '}
        <Link href="/student/complaints" className="underline">
          Write to the Office
        </Link>
        .
      </Alert>
    </>
  )
}
