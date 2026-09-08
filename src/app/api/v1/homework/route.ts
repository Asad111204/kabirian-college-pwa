import { clientIp, jsonOk, parseJsonBody, withAuth, zodFieldErrors } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { createHomework, listHomework } from '@/server/services/homework.service'
import { homeworkCreateSchema, homeworkListQuerySchema } from '@/validation/homework'

/** GET /api/v1/homework — the office's and a teacher's list, scoped on the server. */
export const GET = withAuth(async ({ request, ctx }) => {
  const parsed = homeworkListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) throw new ValidationError('Invalid list options.', zodFieldErrors(parsed.error))
  return jsonOk(await listHomework(ctx, parsed.data))
})

/** POST /api/v1/homework — set a piece of homework for one section and subject. */
export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, homeworkCreateSchema)
  return jsonOk(await createHomework(ctx, input, { ipAddress: clientIp(request), userAgent: request.headers.get('user-agent') }), 201)
})
