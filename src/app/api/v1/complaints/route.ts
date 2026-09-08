import { clientIp, jsonOk, parseJsonBody, withAuth, zodFieldErrors } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { listComplaints, submitComplaint } from '@/server/services/complaints.service'
import { complaintCreateSchema, complaintListQuerySchema } from '@/validation/complaints'

/** GET /api/v1/complaints — the office's list of students' applications. */
export const GET = withAuth(async ({ request, ctx }) => {
  const parsed = complaintListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) throw new ValidationError('Invalid list options.', zodFieldErrors(parsed.error))
  return jsonOk(await listComplaints(ctx, parsed.data))
})

/** POST /api/v1/complaints — a student writes an application to the office. */
export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, complaintCreateSchema)
  return jsonOk(await submitComplaint(ctx, input, { ipAddress: clientIp(request), userAgent: request.headers.get('user-agent') }), 201)
})
