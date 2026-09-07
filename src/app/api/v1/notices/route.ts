import { jsonOk, parseJsonBody, withAuth, zodFieldErrors } from '@/server/api/handler'
import { createNotice, listNotices } from '@/server/services/notices.service'
import { ValidationError } from '@/server/api/errors'
import { noticeCreateSchema, noticeListQuerySchema } from '@/validation/notices'

/** GET /api/v1/notices -- the office's list, every status. Admin only. */
export const GET = withAuth(async ({ request, ctx }) => {
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const parsed = noticeListQuerySchema.safeParse(params)
  if (!parsed.success) {
    throw new ValidationError('Those filters are not valid.', zodFieldErrors(parsed.error))
  }
  return jsonOk(await listNotices(ctx, parsed.data))
})

/** POST /api/v1/notices -- write a notice. It starts as a draft. */
export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, noticeCreateSchema)
  return jsonOk(await createNotice(ctx, input), 201)
})
