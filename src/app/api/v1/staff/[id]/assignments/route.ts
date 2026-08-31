import { jsonOk, parseJsonBody, withAuth } from '@/server/api/handler'
import { createAssignment } from '@/server/services/staff.service'
import { assignmentCreateSchema } from '@/validation/staff'

/** Assigns a teacher to one subject in one section. */
export const POST = withAuth(async ({ request, ctx, params }) => {
  const input = await parseJsonBody(request, assignmentCreateSchema)
  return jsonOk(await createAssignment(ctx, params.id!, input), 201)
})
