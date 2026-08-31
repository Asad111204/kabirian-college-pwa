import { jsonOk, withAuth } from '@/server/api/handler'
import { getPaperOptions } from '@/server/services/exams.service'
import { ValidationError } from '@/server/api/errors'

/**
 * The classes, programmes and subjects an exam paper may use, for one session.
 *
 * Everything comes from that session's structure and curriculum, so nothing
 * here knows the words "Pre-Medical" or "1st Year".
 */
export const GET = withAuth(async ({ request, ctx }) => {
  const academicSessionId = new URL(request.url).searchParams.get('academicSessionId')
  if (!academicSessionId) {
    throw new ValidationError('A sessionId is required.', {
      academicSessionId: ['Choose an academic session.'],
    })
  }
  return jsonOk(await getPaperOptions(ctx, academicSessionId))
})
