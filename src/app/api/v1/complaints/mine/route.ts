import { jsonOk, withAuth, zodFieldErrors } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { listMyComplaints } from '@/server/services/complaints.service'
import { myComplaintsQuerySchema } from '@/validation/complaints'

/** GET /api/v1/complaints/mine — a student's own applications, and only their own. */
export const GET = withAuth(async ({ request, ctx }) => {
  const parsed = myComplaintsQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success) throw new ValidationError('Invalid list options.', zodFieldErrors(parsed.error))
  return jsonOk(await listMyComplaints(ctx, parsed.data))
})
