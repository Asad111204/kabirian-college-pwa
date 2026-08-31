import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import {
  createAcademicSession,
  listAcademicSessions,
} from '@/server/services/academic-structure.service'
import { academicSessionCreateSchema } from '@/validation/academics'

export const GET = withAuth(async ({ ctx }) => jsonOk(await listAcademicSessions(ctx)))

export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, academicSessionCreateSchema)
  return jsonOk(await createAcademicSession(ctx, input), 201)
})
