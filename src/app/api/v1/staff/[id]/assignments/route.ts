import { jsonOk, withAuth, zodFieldErrors } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { createAssignment, createAssignments } from '@/server/services/staff.service'
import type { AssignmentBulkResult, StaffDetail } from '@/server/services/staff.service'
import { assignmentBulkCreateSchema, assignmentCreateSchema } from '@/validation/staff'
import type { z } from 'zod'

/** The same checking `parseJsonBody` does, against a body already in hand. */
function check<S extends z.ZodType>(schema: S, body: unknown): z.infer<S> {
  const result = schema.safeParse(body)
  if (!result.success) throw new ValidationError('Please check the highlighted fields.', zodFieldErrors(result.error))
  return result.data
}

/**
 * Assigns a teacher to subjects in sections.
 *
 * Two shapes, because the office does two different things. Ticking several
 * sections sends `sections`, each naming its own subjects, and every pairing
 * named is made. The older single-pairing shape still works, so anything that
 * sends one section and one subject is unaffected.
 *
 * The body is read once here rather than through `parseJsonBody`, because a
 * request's body can only be read once and which schema applies depends on
 * what is in it.
 */
export const POST = withAuth<AssignmentBulkResult | StaffDetail>(async ({ request, ctx, params }) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    throw new ValidationError('The request body was not valid JSON.')
  }

  if (body && typeof body === 'object' && 'sections' in body) {
    return jsonOk(await createAssignments(ctx, params.id!, check(assignmentBulkCreateSchema, body)), 201)
  }

  return jsonOk(await createAssignment(ctx, params.id!, check(assignmentCreateSchema, body)), 201)
})
