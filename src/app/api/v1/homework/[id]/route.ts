import { clientIp, jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { deleteHomework, getHomework, updateHomework } from '@/server/services/homework.service'
import { homeworkUpdateSchema } from '@/validation/homework'
import { uuid } from '@/validation/common'

const idOf = (value: string | undefined): string => {
  const parsed = uuid.safeParse(value)
  if (!parsed.success) throw new ValidationError('That is not a valid piece of homework.')
  return parsed.data
}

/** GET /api/v1/homework/:id — one piece with its files, for anyone allowed to read it. */
export const GET = withAuth(async ({ ctx, params }) => jsonOk(await getHomework(ctx, idOf(params.id))))

/** PUT /api/v1/homework/:id — change the title, instructions or due date. */
export const PUT = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, homeworkUpdateSchema)
  return jsonOk(await updateHomework(ctx, idOf(params.id), input, { ipAddress: clientIp(request), userAgent: request.headers.get('user-agent') }))
})

/** DELETE /api/v1/homework/:id — remove it from every list (kept, marked). */
export const DELETE = withAuth(async ({ request, ctx, params }) => {
  await deleteHomework(ctx, idOf(params.id), { ipAddress: clientIp(request), userAgent: request.headers.get('user-agent') })
  return jsonOk({ deleted: true })
})
