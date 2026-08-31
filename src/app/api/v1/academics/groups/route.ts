import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import {
  createAcademicGroup,
  listAcademicGroups,
} from '@/server/services/academic-structure.service'
import { academicGroupCreateSchema } from '@/validation/academics'

/** GET /api/v1/academics/groups?sessionId=... — the structure of one session. */
export const GET = withAuth(async ({ request, ctx }) => {
  const sessionId = new URL(request.url).searchParams.get('sessionId')
  if (!sessionId) throw new ValidationError('A sessionId is required.')
  return jsonOk(await listAcademicGroups(ctx, sessionId))
})

/** Creates one Class x Division x Program group plus its first section. */
export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, academicGroupCreateSchema)
  return jsonOk(await createAcademicGroup(ctx, input), 201)
})
