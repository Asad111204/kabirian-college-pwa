import { clientIp, jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { getComplaint, setComplaintStatus } from '@/server/services/complaints.service'
import { complaintStatusChangeSchema } from '@/validation/complaints'
import { uuid } from '@/validation/common'

const idOf = (value: string | undefined): string => {
  const parsed = uuid.safeParse(value)
  if (!parsed.success) throw new ValidationError('That is not a valid application.')
  return parsed.data
}

/** GET /api/v1/complaints/:id — one application with its exchange. */
export const GET = withAuth(async ({ ctx, params }) => jsonOk(await getComplaint(ctx, idOf(params.id))))

/** PATCH /api/v1/complaints/:id — the office moves it to another state. */
export const PATCH = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, complaintStatusChangeSchema)
  return jsonOk(await setComplaintStatus(ctx, idOf(params.id), input, { ipAddress: clientIp(request), userAgent: request.headers.get('user-agent') }))
})
