import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { createProgram, listPrograms } from '@/server/services/academic-blocks.service'
import { programCreateSchema } from '@/validation/academics'

/** GET /api/v1/academics/programs?includeInactive=true */
export const GET = withAuth(async ({ request, ctx }) => {
  const params = new URL(request.url).searchParams
  const programs = await listPrograms(ctx, {
    includeInactive: params.get('includeInactive') === 'true',
    search: params.get('search') ?? undefined,
  })
  return jsonOk(programs)
})

/**
 * POST /api/v1/academics/programs
 *
 * This is the endpoint behind "Academic Management -> Programs -> Add Program".
 * Creating "I.Com" here makes it immediately available everywhere a program can
 * be chosen — no source-code change (requirement 13).
 */
export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, programCreateSchema)
  const program = await createProgram(ctx, input)
  return jsonOk(program, 201)
})
