import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import {
  deleteNotice,
  getNotice,
  setNoticeStatus,
  updateNotice,
} from '@/server/services/notices.service'
import { noticeStatusSchema, noticeUpdateSchema } from '@/validation/notices'

/** GET /api/v1/notices/[id] -- one notice as the office sees it. Admin only. */
export const GET = withAuth(async ({ ctx, params }) => jsonOk(await getNotice(ctx, params.id!)))

/** PUT /api/v1/notices/[id] -- replace the content and the whole audience. */
export const PUT = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, noticeUpdateSchema)
  return jsonOk(await updateNotice(ctx, params.id!, input))
})

/** PATCH /api/v1/notices/[id] -- draft, publish or archive. */
export const PATCH = withAuth(async ({ request, ctx, params }) => {
  const { status } = await parseJsonBody(request, noticeStatusSchema)
  return jsonOk(await setNoticeStatus(ctx, params.id!, status))
})

/** DELETE /api/v1/notices/[id] -- a draft only. A published notice is archived. */
export const DELETE = withAuth(async ({ ctx, params }) => {
  await deleteNotice(ctx, params.id!)
  return jsonOk({ deleted: true })
})
