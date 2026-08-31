import { jsonOk, parseJsonBody, withAuth, zodFieldErrors } from '@/server/api/handler'
import { ValidationError } from '@/server/api/errors'
import { createStudent, listStudents } from '@/server/services/students.service'
import { studentCreateSchema, studentListQuerySchema } from '@/validation/students'

/**
 * GET /api/v1/students
 *
 * Searched, filtered, sorted and paginated on the server — a college with
 * thousands of students never sends more than one page to the browser.
 */
export const GET = withAuth(async ({ request, ctx }) => {
  const params = Object.fromEntries(new URL(request.url).searchParams)
  const parsed = studentListQuerySchema.safeParse(params)
  if (!parsed.success) {
    throw new ValidationError('Invalid list options.', zodFieldErrors(parsed.error))
  }
  return jsonOk(await listStudents(ctx, parsed.data))
})

/**
 * POST /api/v1/students — admit a student.
 *
 * Creates the record, their first enrollment and (optionally) a portal login in
 * one transaction. When an account is created its temporary password is in the
 * response once and nowhere else.
 */
export const POST = withAuth(async ({ request, ctx }) => {
  const input = await parseJsonBody(request, studentCreateSchema)
  return jsonOk(await createStudent(ctx, input), 201)
})
