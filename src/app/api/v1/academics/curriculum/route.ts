import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { getCurriculum, setCurriculum } from '@/server/services/academic-structure.service'
import { curriculumSetSchema } from '@/validation/academics'

/** GET ?sessionId=&classId=&programId= — the subject list of one class+program. */
export const GET = withAuth(async ({ request, ctx }) => {
  const params = new URL(request.url).searchParams
  const academicSessionId = params.get('sessionId')
  const classId = params.get('classId')
  const programId = params.get('programId')

  if (!academicSessionId || !classId || !programId) {
    throw new ValidationError('sessionId, classId and programId are all required.')
  }

  return jsonOk(await getCurriculum(ctx, { academicSessionId, classId, programId }))
})

/** Replaces that subject list. Different programs have different subjects. */
export const PUT = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, curriculumSetSchema)
  return jsonOk(await setCurriculum(ctx, input))
})
