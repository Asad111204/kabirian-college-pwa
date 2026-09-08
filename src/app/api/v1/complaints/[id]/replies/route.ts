import { clientIp, jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { replyToComplaint } from '@/server/services/complaints.service'
import { complaintReplySchema } from '@/validation/complaints'
import { uuid } from '@/validation/common'

const idOf = (value: string | undefined): string => {
  const parsed = uuid.safeParse(value)
  if (!parsed.success) throw new ValidationError('That is not a valid application.')
  return parsed.data
}

/** POST /api/v1/complaints/:id/replies — the student or the office adds a message. */
export const POST = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, complaintReplySchema)
  return jsonOk(await replyToComplaint(ctx, idOf(params.id), input, { ipAddress: clientIp(request), userAgent: request.headers.get('user-agent') }), 201)
})
