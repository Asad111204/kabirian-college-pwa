import { jsonOk, withAuth } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { getEnrollmentOptions } from '@/server/services/students.service'

/**
 * GET /api/v1/students/enrollment-options?sessionId=…
 *
 * Every Class × Division × Program combination that exists in the session, with
 * its sections. The enrollment form narrows the dropdowns from this one list,
 * so choosing a class does not need another request — and a program created a
 * moment ago is already included.
 */
export const GET = withAuth(async ({ request, ctx }) => {
  const sessionId = new URL(request.url).searchParams.get('sessionId')
  if (!sessionId) throw new ValidationError('A sessionId is required.')
  return jsonOk(await getEnrollmentOptions(ctx, sessionId))
})
