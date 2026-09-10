import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { copyTimetableDay, type CopyDayResult } from '@/server/services/timetable.service'
import { timetableCopyDaySchema } from '@/validation/timetable'

/**
 * POST /api/v1/timetable/copy-day
 *
 * Copies one day of a section's week onto other days, because a college week
 * repeats: Monday, Wednesday and Friday are often the same day three times.
 *
 * Every copied lesson goes through the same checks a hand-typed one does, so
 * a teacher who is already busy on Wednesday is reported rather than
 * double-booked. Target days that already have lessons are left alone unless
 * the request says to replace them.
 */
export const POST = withAuth<CopyDayResult>(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, timetableCopyDaySchema)
  return jsonOk(await copyTimetableDay(ctx, input))
})
