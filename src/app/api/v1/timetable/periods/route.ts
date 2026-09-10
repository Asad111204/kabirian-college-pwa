import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { getCollegePeriods, setCollegePeriods } from '@/server/timetable/period-settings'
import { collegePeriodsSchema } from '@/validation/timetable'
import type { CollegePeriod } from '@/server/timetable/periods'

/**
 * GET /api/v1/timetable/periods — the college's day, as it runs today.
 *
 * Readable by anyone signed in: the times are printed on every timetable and
 * are not a secret from the people keeping to them.
 */
export const GET = withAuth<CollegePeriod[]>(async () => jsonOk(await getCollegePeriods()))

/**
 * PUT /api/v1/timetable/periods — replaces it.
 *
 * The whole day is sent at once. Editing it is one decision rather than nine,
 * and saving it a period at a time would leave the college with a grid that
 * overlaps itself between two saves.
 */
export const PUT = withAuth<CollegePeriod[]>(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, collegePeriodsSchema)
  return jsonOk(await setCollegePeriods(ctx, input.periods))
})
