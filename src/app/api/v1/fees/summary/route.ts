import { jsonOk, withAuth } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { getFeeMonthSummary } from '@/server/services/fees.service'
import { todayInCollegeTimezone } from '@/server/time/college-date'
import { isoDate } from '@/validation/common'

/** GET /api/v1/fees/summary?month=YYYY-MM-DD — what a month came to. */
export const GET = withAuth(async ({ request, ctx }) => {
  const raw = new URL(request.url).searchParams.get('month')
  if (!raw) return jsonOk(await getFeeMonthSummary(ctx, todayInCollegeTimezone()))

  const month = isoDate.safeParse(raw)
  if (!month.success) throw new ValidationError('Use the format YYYY-MM-DD.', { month: ['Use the format YYYY-MM-DD.'] })
  return jsonOk(await getFeeMonthSummary(ctx, month.data))
})
