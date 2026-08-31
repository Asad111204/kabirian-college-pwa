import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { createSubject, listSubjects } from '@/server/services/academic-blocks.service'
import { subjectCreateSchema } from '@/validation/academics'

export const GET = withAuth(async ({ request, ctx }) => {
  const params = new URL(request.url).searchParams
  return jsonOk(
    await listSubjects(ctx, {
      includeInactive: params.get('includeInactive') === 'true',
      search: params.get('search') ?? undefined,
      page: Number(params.get('page') ?? 1),
      pageSize: Number(params.get('pageSize') ?? 100),
    }),
  )
})

export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, subjectCreateSchema)
  return jsonOk(await createSubject(ctx, input), 201)
})
