import { clientIp, jsonOk, withAuth } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { withdrawComplaint } from '@/server/services/complaints.service'
import { uuid } from '@/validation/common'

const idOf = (value: string | undefined): string => {
  const parsed = uuid.safeParse(value)
  if (!parsed.success) throw new ValidationError('That is not a valid application.')
  return parsed.data
}

/** POST /api/v1/complaints/:id/withdraw — the student takes their application back. */
export const POST = withAuth(async ({ request, ctx, params }) =>
  jsonOk(await withdrawComplaint(ctx, idOf(params.id), { ipAddress: clientIp(request), userAgent: request.headers.get('user-agent') })),
)
